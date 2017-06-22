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

var RQCommon = require('../rq/rq-common');
var RQBShare = RQCommon.require(__dirname, '../../../../lib/backends/rqb/share');
var RQBTree = RQCommon.require(__dirname, '../../../../lib/backends/rqb/tree');

describe('RQBTree', function () {
    var c;

    beforeEach(function () {
        c = new RQCommon({
            shareType: RQBShare,
            treeType: RQBTree
        });
    });

    it('testCreateLocalFile', function (done) {
        c.addFile(c.localTree, '/test', function () {
            c.testTree.createLocalFile('/test', function (err, file) {
                expect(err).toBeFalsy();
                expect(file.dirty).toBeTruthy();
                done();
            });
        });
    });

    it('testCreateLocalDirectory', function (done) {
        c.addDirectory(c.localTree, '/test', function () {
            c.testTree.createLocalDirectory('/test', function (err, file) {
                expect(err).toBeFalsy();
                expect(file.getName()).toEqual('test');
                done();
            });
        });
    });

    it('testDeleteLocal', function (done) {
        c.addFile(c.localTree, '/test', function () {
            c.testTree.deleteLocal('/test', function (err) {
                expect(err).toBeFalsy();
                c.expectLocalFileExistExt('/test', true, false, false, done);
            });
        });
    });

    it('testDeleteLocalDirectory', function (done) {
        c.addDirectory(c.localTree, '/test', function () {
            c.testTree.deleteLocal('/test', function (err) {
                expect(err).toBeFalsy();
                c.expectLocalFileExistExt('/test', true, false, false, done);
            });
        });
    });

    it('testRenameLocal', function (done) {
        c.addFile(c.localTree, '/test', function () {
            c.testTree.renameLocal('/test', '/test2', true, function (err) {
                expect(err).toBeFalsy();
                c.expectLocalFileExistExt('/test', true, false, false, function () {
                    c.expectLocalFileExistExt('/test2', false, false, false, done);
                });
            });
        });
    });

    it('testExistsLocal', function (done) {
        c.addFile(c.localRawTree, '/test', function () {
            c.testTree.existsLocal('/test', function (err, exists) {
                expect(err).toBeFalsy();
                expect(exists).toBeFalsy();
                done();
            });
        });
    });

    it('testExistsLocalWork', function (done) {
        c.localRawTree.createFile('/.aem/test.json', function (err) {
          expect(err).toBeFalsy();
          c.testTree.existsLocal('/test', function (err, exists) {
            expect(err).toBeFalsy();
            expect(exists).toBeTruthy();
            done();
          });
        });
    });

    it('testExistsTemp', function (done) {
        c.testTree.existsLocal('/.test', function (err, exists) {
            expect(err).toBeFalsy();
            expect(exists).toBeTruthy();
            done();
        });
    });

    it('testIsLocalDirectory', function (done) {
      c.localRawTree.createFile('/.aem/test.json', function (err) {
        expect(err).toBeFalsy();
        c.testTree.isLocalDirectory('/test', function (err, isdir) {
          expect(err).toBeFalsy();
          expect(isdir).toBeFalsy();
          done();
        });
      });
    });

    it('testIsLocalDirectoryTrue', function (done) {
      c.localRawTree.createDirectory('/test', function (err) {
        expect(err).toBeFalsy();
        c.testTree.isLocalDirectory('/test', function (err, isdir) {
          expect(err).toBeFalsy();
          expect(isdir).toBeTruthy();
          done();
        });
      });
    });
});
