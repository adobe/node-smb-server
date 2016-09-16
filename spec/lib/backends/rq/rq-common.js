/*
 * ADOBE CONFIDENTIAL
 * __________________
 *
 *  Copyright 2015 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 */

var common = require('../../test-common');
var RQTree = require('../../../../lib/backends/rq/tree');
var RQShare = require('../../../../lib/backends/rq/share');
var RQFile = require('../../../../lib/backends/rq/file');
var TestTree = require('../test/tree');
var TestShare = require('../test/share');
var util = require('util');
var utils = require('../../../../lib/utils');

function RQCommon() {
    var self = this;
    common.call(this);

    self.remoteTree = new TestTree();
    self.localTree = new TestTree();
    self.workTree = new TestTree();
    self.tempFilesTree = new TestTree();

    self.config = {
        backend:'test',
        modifiedThreshold: 100,
        local: {
            path: '/local/path'
        },
        work: {
            path: '/work/path'
        },
        localTree: self.localTree,
        tree: self.remoteTree,
        contentCacheTTL: 200
    };
    self.testShare = new RQShare(
        'rq',
        self.config,
        new TestShare('test', self.config),
        self.remoteTree,
        self.localTree,
        self.workTree);
    self.testTree = new RQTree(
        self.testShare,
        self.remoteTree,
        {
            localTree: self.localTree,
            workTree: self.workTree,
            rqdb: self.db,
            noprocessor: true
        });
    spyOn(self.remoteTree, 'exists').andCallThrough();
    spyOn(self.localTree, 'exists').andCallThrough();
    spyOn(self.workTree, 'exists').andCallThrough();
    spyOn(self.testShare, 'emit').andCallThrough();
};

util.inherits(RQCommon, common);

RQCommon.prototype.addDirectory = function (tree, dirName, cb) {
    tree.addDirectory(dirName, false, function (err, file) {
        expect(err).toBeFalsy();
        cb(file);
    });
};

RQCommon.prototype.addFile = function (tree, fileName, cb) {
    tree.addFile(fileName, false, fileName, function (err, file) {
        expect(err).toBeFalsy();
        cb(file);
    });
};

RQCommon.prototype.addFiles = function (tree, numFiles, cb) {
    var self = this;
    var addTreeFile = function (index) {
        if (index < numFiles) {
            self.addFile(tree, '/testfile' + (index + 1), function () {
                addTreeFile(index + 1);
            });
        } else {
            cb();
        }
    };
    addTreeFile(0);
};

RQCommon.prototype.addLocalFile = function (fileName, cb) {
    var self = this;
    self.addFile(self.localTree, fileName, function () {
        self.addFile(self.workTree, fileName, cb);
    });
};

RQCommon.prototype.addLocalFiles = function (numFiles, cb) {
    var self = this;
    self.addFiles(self.localTree, numFiles, function () {
        self.addFiles(self.workTree, numFiles, cb);
    });
};

RQCommon.prototype.addLocalFileWithDates = function (path, readOnly, content, created, lastModified, cb) {
    var self = this;
    self.localTree.addFileWithDates(path, readOnly, content, created, lastModified, function (err) {
        expect(err).toBeFalsy();
        self.addFile(self.workTree, path, cb);
    });
};

RQCommon.prototype.expectLocalFileExistExt = function (fileName, localExists, workExists, createExists, cb) {
    var self = this;
    self.localTree.exists(fileName, function (err, exists) {
        expect(err).toBeFalsy();
        expect(exists).toEqual(localExists);
        self.workTree.exists(fileName, function (err, exists) {
            expect(err).toBeFalsy();
            expect(exists).toEqual(workExists);
            self.workTree.exists(self.testTree.getCreateFileName(fileName), function (err, exists) {
                expect(err).toBeFalsy();
                expect(exists).toEqual(createExists);
                cb();
            });
        });
    });
};

RQCommon.prototype.expectLocalFileExist = function (fileName, doesExist, createExist, cb) {
    this.expectLocalFileExistExt(fileName, doesExist, doesExist, createExist, cb);
};

RQCommon.prototype.expectPathExist = function (tree, path, doesExist, cb) {
    tree.exists(path, function (err, exists) {
        expect(err).toBeFalsy();
        expect(exists).toEqual(doesExist);
        cb();
    });
};

RQCommon.prototype.expectQueuedMethod = function (path, name, method, cb) {
    this.testTree.rq.getRequests(path, function (err, lookup) {
        expect(err).toBeFalsy();
        if (method) {
            expect(lookup[name]).toEqual(method);
        } else {
            expect(lookup[name]).toBeUndefined();
        }
        cb();
    });
};

RQCommon.prototype.addQueuedFile = function (path, cb) {
    var self = this;
    self.testTree.createFile(path, function (err, file) {
        expect(err).toBeFalsy();
        file.setLength(path.length, function (err) {
            expect(err).toBeFalsy();
            file.write(path, 0, function (err) {
                expect(err).toBeFalsy();
                file.close(function (err) {
                    expect(err).toBeFalsy();
                    self.expectLocalFileExist(path, true, true, function () {
                        self.expectQueuedMethod(utils.getParentPath(path), utils.getPathName(path), 'PUT', function () {
                            self.testTree.open(path, function (err, newFile) {
                                expect(err).toBeFalsy();
                                cb(newFile);
                            });
                        });
                    });
                });
            });
        });
    });
};

module.exports = RQCommon;
