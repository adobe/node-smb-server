/*
 *  Copyright 2016 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

var common = require('../../test-common');
var RQTree = require('../../../../lib/backends/rq/tree');
var RQShare = require('../../../../lib/backends/rq/share');
var TestTree = require('../test/tree');
var TestShare = require('../test/share');
var util = require('util');
var utils = require('../../../../lib/utils');

function RQCommon(config) {
    var self = this;
    common.call(this);

    config = config || {};

    if (config.shareType) {
        RQShare = config.shareType;
    }
    if (config.treeType) {
        RQTree = config.treeType;
    }

    self.remoteTree = new TestTree();
    self.localTree = new TestTree();
    self.localWorkTree = new TestTree();
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
        self.localWorkTree);
    self.testTree = new RQTree(
        self.testShare,
        self.remoteTree,
        {
            localTree: self.localTree,
            workTree: self.localWorkTree,
            rqdb: self.db,
            noprocessor: true
        });
    self.workTree = self.testTree.work;
    spyOn(self.remoteTree, 'exists').andCallThrough();
    spyOn(self.remoteTree, 'open').andCallThrough();
    spyOn(self.remoteTree, 'delete').andCallThrough();
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
        self.workTree.createFileExisting(fileName, cb);
    });
};

RQCommon.prototype.addLocalFiles = function (numFiles, cb) {
    var self = this;

    function addWorkFile (index) {
        if (index < numFiles) {
            self.workTree.createFileExisting('/testfile' + (index + 1), function (err) {
                expect(err).toBeFalsy();
                addWorkFile(index + 1);
            });
        } else {
            cb();
        }
    }

    self.addFiles(self.localTree, numFiles, function () {
        addWorkFile(0);
    });
};

RQCommon.prototype.addLocalFileWithDates = function (path, readOnly, content, created, lastModified, cb) {
    var self = this;
    self.localTree.addFileWithDates(path, readOnly, content, created, lastModified, function (err) {
        expect(err).toBeFalsy();
        self.workTree.createFileExisting(path, cb);
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

RQCommon.prototype.addCachedFile = function (path, cb) {
    var c = this;
    c.addFile(c.remoteTree, path, function () {
        c.testTree.open(path, function (err, file) {
            expect(err).toBeFalsy();
            file.cacheFile(function (err) {
                expect(err).toBeFalsy();
                file.close(function (err) {
                    expect(err).toBeFalsy();
                    cb();
                });
            });
        });
    });
};

RQCommon.prototype.addDeletedFile = function (path, cb) {
    var c = this;
    c.addCachedFile(path, function () {
        c.testTree.open(path, function (err, file) {
            c.testTree.delete(path, function (err) {
                expect(err).toBeFalsy();
                c.expectQueuedMethod(utils.getParentPath(path), utils.getPathName(path), 'DELETE', function () {
                    c.expectLocalFileExist(path, false, false, cb);
                });
            });
        });
    });
};

module.exports = RQCommon;
