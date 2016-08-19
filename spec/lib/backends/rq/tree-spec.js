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

var RQTree = require('../../../../lib/backends/rq/tree');
var utils = require('../../../../lib/utils');
var RQCommon = require('./rq-common');

describe('RQTree', function () {
    var common;

    beforeEach(function () {
        common = new RQCommon();
    });

    describe('Exists', function () {
        it('testExistsFalse', function (done) {
             common.testTree.exists('/testfile', function (err, exists) {
                expect(err).toBeFalsy();
                expect(exists).toBeFalsy();
                done();
            });
        });

        it('testExistsRemoteOnly', function (done) {
            common.addFile(common.remoteTree, '/testfile', function () {
                common.testTree.exists('/testfile', function (err, exists) {
                    expect(err).toBeFalsy();
                    expect(exists).toBeTruthy();
                    done();
                });
            });
        });

        it('testExistsLocalOnly', function (done) {
            common.addFile(common.localTree, '/testfile', function () {
                common.testTree.exists('/testfile', function (err, exists) {
                    expect(err).toBeFalsy();
                    expect(exists).toBeTruthy();
                    done();
                });
            });
        });

        it('testExistsLocalAndRemote', function (done) {
            common.addFile(common.localTree, '/testFile', function () {
                common.addFile(common.remoteTree, '/testFile', function () {
                    common.testTree.exists('/testFile', function (err, exists) {
                        expect(err).toBeFalsy();
                        expect(exists).toBeTruthy();
                        done();
                    });
                });
            });
        });
    });

    describe('Open', function () {
        it('testOpenRemoteOnly', function (done) {
            common.addFile(common.remoteTree, '/testfile', function () {
                common.testTree.open('/testfile', function (err, file) {
                    expect(err).toBeFalsy();
                    expect(file).toBeDefined();
                    common.expectRemoteFile(file);
                    done();
                });
            });
        });

        it('testOpenLocalOnly', function (done) {
            common.addFile(common.localTree, '/testfile', function () {
                common.testTree.open('/testfile', function (err, file) {
                    expect(err).toBeFalsy();
                    expect(file).toBeDefined();
                    common.expectLocalFile(file);
                    done();
                });
            });
        });

        it('testOpenLocalAndRemote', function (done) {
            common.addFile(common.localTree, '/testfile', function () {
                common.addFile(common.remoteTree, '/testfile', function () {
                    common.testTree.open('/testfile', function (err, file) {
                        expect(err).toBeFalsy();
                        expect(file).toBeDefined();
                        common.expectLocalRemoteFile(file);
                        done();
                    });
                });
            });
        });
    });

    describe('List', function () {
        var expectHasFile = function (files, path) {
            var hasFile = false;
            for (var i = 0; i < files.length; i++) {
                if (files[i].getPath() == path) {
                    hasFile = true;
                    break;
                }
            }
            expect(hasFile).toBeTruthy();
        };

        it('testListRemoteOnly', function (done) {
            common.addFiles(common.remoteTree, 3, function () {
                common.testTree.list('/', function (err, files) {
                    expect(err).toBeFalsy();
                    expectHasFile(files, '/testfile1');
                    expectHasFile(files, '/testfile2');
                    expectHasFile(files, '/testfile3');
                    done();
                });
            });
        });

        it('testListLocalCreated', function (done) {
            common.addFile(common.remoteTree, '/testremote', function () {
                common.testTree.createFile('/testfile1', function (err, file) {
                    expect(err).toBeFalsy();
                    common.testTree.list('/', function (err, files) {
                        expect(err).toBeFalsy();
                        expectHasFile(files, '/testremote');
                        expectHasFile(files, '/testfile1');
                        done();
                    });
                });
            });
        });

        it('testListLocalNoCreated', function (done) {
            common.addFile(common.localTree, '/testlocal', function () {
                common.testTree.list('/', function (err, files) {
                    expect(err).toBeFalsy();
                    expect(files.length).toEqual(0);
                    common.expectLocalFileExist('/testLocal', false, false, done);
                });
            });
        });

        it('testListLocalNoCreatedUnsafeDelete', function (done) {
            var currTime = new Date().getTime();
            common.localTree.addFileWithDates('/testlocal', false, 'content', currTime, currTime + 20000, function (err, file) {
                expect(err).toBeFalsy();
                common.testTree.list('/', function (err, files) {
                    expect(err).toBeFalsy();
                    expect(files.length).toEqual(1);
                    expect(common.testShare.emit.mostRecentCall.args[0]).toEqual('syncconflict');
                    common.expectLocalFileExist('/testlocal', true, false, done);
                });
            });
        });

        it('testListLocalTempFile', function (done) {
            common.addFiles(common.remoteTree, 3, function () {
                common.addFile(common.localTree, '/.tempfile', function () {
                    common.testTree.list('/', function (err, files) {
                        expect(err).toBeFalsy();
                        expect(files.length).toEqual(4);
                        expectHasFile(files, '/.tempfile');
                        common.expectLocalFileExistExt('/.tempfile', true, false, false, done);
                    });
                });
            });
        });

        it('testListRemoteDeletedLocally', function (done) {
            common.addFiles(common.remoteTree, 3, function () {
                common.testTree.delete('/testfile1', function (err) {
                    expect(err).toBeFalsy();
                    common.testTree.list('/', function (err, files) {
                        expect(err).toBeFalsy();
                        expect(files.length).toEqual(2);
                        expectHasFile(files, '/testfile2');
                        expectHasFile(files, '/testfile3');
                        done();
                    });
                });
            });
        });

        it('testListRemoteDeleted', function (done) {
            common.addFiles(common.remoteTree, 3, function () {
                common.addFiles(common.localTree, 3, function () {
                    common.remoteTree.delete('/testfile1', function (err) {
                        expect(err).toBeFalsy();
                        common.testTree.list('/', function (err, files) {
                            expect(err).toBeFalsy();
                            expect(files.length).toEqual(2);
                            expectHasFile(files, '/testfile2');
                            expectHasFile(files, '/testfile3');
                            common.expectQueuedMethod('/', 'testfile1', false, function () {
                                common.expectLocalFileExist('/testfile1', false, false, done);
                            });
                        });
                    });
                });
            });
        });

        it('testListRemoteDeletedCantDelete', function (done) {
            var currTime = new Date().getTime();
            common.addFiles(common.remoteTree, 3, function () {
                common.addFiles(common.localTree, 2, function () {
                    common.localTree.addFileWithDates('/testfile3', false, 'content', currTime, currTime + 20000, function (err, file) {
                        expect(err).toBeFalsy();
                        common.remoteTree.delete('/testfile3', function (err) {
                            expect(err).toBeFalsy();
                            common.testTree.list('/', function (err, files) {
                                expect(err).toBeFalsy();
                                expect(files.length).toEqual(3);
                                expectHasFile(files, '/testfile1');
                                expectHasFile(files, '/testfile2');
                                expectHasFile(files, '/testfile3');
                                common.expectQueuedMethod('/', 'testfile3', false, function () {
                                    expect(common.testShare.emit.mostRecentCall.args[0]).toEqual('syncconflict');
                                    common.expectLocalFileExist('/testfile3', true, false, done);
                                });
                            });
                        });
                    });
                });
            });
        });

        it('testListRemoteDirectoryDeleted', function (done) {
            common.addFiles(common.remoteTree, 3, function () {
                common.addDirectory(common.remoteTree, '/test', function () {
                    common.addDirectory(common.localTree, '/test', function () {
                        common.remoteTree.deleteDirectory('/test', function (err) {
                            expect(err).toBeFalsy();
                            common.testTree.list('/', function (err, items) {
                                expect(err).toBeFalsy();
                                expect(items.length).toEqual(3);
                                expectHasFile(items, '/testfile1');
                                expectHasFile(items, '/testfile2');
                                expectHasFile(items, '/testfile3');
                                common.expectPathExist(common.localTree, '/test', false, done);
                            });
                        });
                    });
                });
            });
        });
    });

    describe('DeleteLocalDirectoryRecursive', function () {
        it('testDeleteLocalDirectoryRecursive', function (done) {
            common.addDirectory(common.localTree, '/removeme', function () {
                common.addFile(common.localTree, '/removeme/file1', function () {
                    common.addDirectory(common.localTree, '/removeme/subfolder', function () {
                        common.addFile(common.localTree, '/removeme/subfolder/file2', function () {
                            common.testTree.deleteLocalDirectoryRecursive('/removeme', function (err) {
                                expect(err).toBeFalsy();
                                common.expectPathExist(common.localTree, '/removeme', false, function () {
                                    common.expectPathExist(common.localTree, '/removeme/subfolder', false, function () {
                                        common.expectLocalFileExist('/removeme/file1', false, false, function () {
                                            common.expectLocalFileExist('/removeme/subfolder/file2', false, false, done);
                                        });
                                    });
                                });
                            });
                        });
                    })
                });
            });
        });

        it('testDeleteLocalDirectoryRecursiveCantDelete', function (done) {
            common.addDirectory(common.localTree, '/removeme', function () {
                common.addDirectory(common.localTree, '/removeme/sub', function () {
                    common.addFile(common.localTree, '/removeme/sub/file1', function () {
                        common.addFile(common.localTree, '/removeme/sub/file2', function () {
                            common.localTree.open('/removeme/sub/file1', function (err, file) {
                                expect(err).toBeFalsy();
                                file.setLastModified(file.lastModified() + 100000);
                                file.close(function (err) {
                                    expect(err).toBeFalsy();
                                    common.testTree.deleteLocalDirectoryRecursive('/removeme', function (err) {
                                        expect(err).toBeFalsy();
                                        common.expectPathExist(common.localTree, '/removeme', true, function () {
                                            common.expectPathExist(common.localTree, '/removeme/sub', true, function () {
                                                common.expectLocalFileExist('/removeme/sub/file1', true, false, function () {
                                                    common.expectLocalFileExist('/removeme/sub/file2', false, false, function () {
                                                        expect(common.testShare.emit.mostRecentCall.args[0]).toEqual('syncconflict');
                                                        done();
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });

    describe('QueueData', function () {
        it('testQueueData', function (done) {
            common.testTree.queueData('/testfile', 'PUT', false, function (err) {
                expect(err).toBeFalsy();
                common.expectQueuedMethod('/', 'testfile', 'PUT', done);
            });
        });

        it('testQueueDataNewName', function (done) {
            common.testTree.queueData('/testfile', 'PUT', '/testfile2', function (err) {
                expect(err).toBeFalsy();
                common.expectQueuedMethod('/', 'testfile', 'PUT', done);
            });
        });

        it('testQueueDataTempFile', function (done) {
            common.testTree.queueData('/.tempfile', 'PUT', false, function (err) {
                expect(err).toBeFalsy();
                common.expectQueuedMethod('/', '.tempfile', false, done);
            });
        });
    });

    it('testGetCreateFileName', function() {
        expect(common.testTree.getCreateFileName('/testfile')).not.toEqual('/testfile');
    });

    it('testCreateFile', function (done) {
        common.testTree.createFile('/testfile1', function (err, file) {
            common.expectLocalFileExist('/testfile1', true, true, done);
        });
    });

    it('testCreateDirectory', function (done) {
        common.testTree.createDirectory('/test', function (err, dir) {
            expect(err).toBeFalsy();
            expect(dir.isDirectory()).toBeTruthy();
            common.localTree.exists('/test', function (err, exists) {
                expect(err).toBeFalsy();
                expect(exists).toBeTruthy();
                common.remoteTree.exists('/test', function (err, exists) {
                    expect(err).toBeFalsy();
                    expect(exists).toBeTruthy();
                    done();
                });
            });
        });
    });

    describe('Delete', function () {
        it('testDeleteLocalOnly', function (done) {
            common.testTree.createFile('/testfile', function (err, file) {
                expect(err).toBeFalsy();
                expect(file.isFile()).toBeTruthy();

                common.expectLocalFileExist('/testfile', true, true, function () {
                    common.testTree.delete('/testfile', function (err) {
                        expect(err).toBeFalsy();
                        common.expectLocalFileExistExt('/testfile', false, false, false, function () {
                            common.expectQueuedMethod('/', 'testfile', false, done);
                        });
                    });
                });
            });
        });

        it('testDeleteLocal', function (done) {
            common.addFile(common.localTree, '/testfile', function (file) {
                common.addFile(common.remoteTree, '/testfile', function (file) {
                    common.testTree.delete('/testfile', function (err) {
                        expect(err).toBeFalsy();
                        common.expectLocalFileExistExt('/testfile', false, false, false, function () {
                            common.remoteTree.exists('/testfile', function (err, exists) {
                                expect(err).toBeFalsy();
                                expect(exists).toBeTruthy();
                                common.expectQueuedMethod('/', 'testfile', 'DELETE', done);
                            });
                        });
                    });
                });
            });
        });

        it('testDeleteRemoteOnly', function (done) {
            common.addFile(common.remoteTree, '/testfile', function (file) {
                common.testTree.delete('/testfile', function (err) {
                    expect(err).toBeFalsy();
                    common.remoteTree.exists('/testfile', function (err, exists) {
                        expect(err).toBeFalsy();
                        expect(exists).toBeTruthy();
                        common.expectQueuedMethod('/', 'testfile', 'DELETE', done);
                    });
                });
            });
        });
    });

    describe('DeleteDirectory', function () {
        it('testDeleteDirectoryLocal', function (done) {
            common.addQueuedFile('/test/testfile', function () {
                common.addFile(common.remoteTree, '/test/testfile', function (file) {
                    common.testTree.deleteDirectory('/test', function (err) {
                        common.expectPathExist(common.remoteTree, '/test', false, function () {
                            common.expectPathExist(common.localTree, '/test', false, function () {
                                common.expectPathExist(common.workTree, '/test', false, function () {
                                    common.expectQueuedMethod('/test', 'testfile', false, done);
                                });
                            });
                        });
                    });
                });
            });
        });

        it('testDeleteDirectoryRemoteOnly', function (done) {
            common.addDirectory(common.remoteTree, '/test', function (dir) {
                common.testTree.deleteDirectory('/test', function (err) {
                    expect(err).toBeUndefined();
                    common.expectPathExist(common.remoteTree, '/test', false, done);
                });
            });
        });
    });

    describe('Rename', function () {
        it('testRenameLocalFile', function (done) {
            common.addQueuedFile('/testfile', function () {
                common.testTree.rename('/testfile', '/testfile2', function (err) {
                    expect(err).toBeFalsy();
                    common.expectLocalFileExist('/testfile', false, false, function() {
                        common.expectLocalFileExist('/testfile2', true, true, function() {
                            common.expectQueuedMethod('/', 'testfile2', 'PUT', function () {
                                common.expectQueuedMethod('/', 'testfile', false, done);
                            });
                        });
                    });
                });
            });
        });

        it('testRenameLocalFileCreateDateOnly', function(done) {
            common.addFile(common.localTree, '/testfile', function () {
                common.addFile(common.workTree, '/testfile', function() {
                    common.testTree.rename('/testfile', '/testfile2', function (err) {
                        expect(err).toBeFalsy();
                        common.expectLocalFileExist('/testfile', false, false, function() {
                            common.expectLocalFileExist('/testfile2', true, true, done);
                        });
                    });
                });
            });
        });

        it('testRenameLocalFileCreatedOnly', function (done) {
            common.addFile(common.localTree, '/testfile', function () {
                common.addFile(common.workTree, common.testTree.getCreateFileName('/testfile'), function () {
                    common.testTree.rename('/testfile', '/testfile2', function (err) {
                        expect(err).toBeFalsy();
                        common.expectLocalFileExist('/testfile', false, false, function() {
                            common.expectLocalFileExistExt('/testfile2', true, false, true, done);
                        });
                    });
                });
            });
        });

        it('testRenameLocalFileOnly', function (done) {
            common.addFile(common.localTree, '/testfile', function () {
                common.testTree.rename('/testfile', '/testfile2', function (err) {
                    expect(err).toBeFalsy();
                    common.expectLocalFileExist('/testfile', false, false, function () {
                        common.expectLocalFileExistExt('/testfile2', true, false, true, done);
                    });
                });
            });
        });

        it('testRenameFileRemoteOnly', function (done) {
            common.addFile(common.remoteTree, '/testfile', function() {
                common.testTree.rename('/testfile', '/testfile2', function (err) {
                    expect(err).toBeFalsy();
                    common.expectPathExist(common.remoteTree, '/testfile', false, function (){
                        common.expectPathExist(common.remoteTree, '/testfile2', true, done);
                    });
                });
            });
        });

        it('testRenameFolderRemoteOnly', function (done) {
            common.addDirectory(common.remoteTree, '/test', function () {
                common.testTree.rename('/test', '/test2', function (err) {
                    expect(err).toBeFalsy();
                    common.expectPathExist(common.remoteTree, '/test', false, function () {
                        common.expectPathExist(common.remoteTree, '/test2', true, done);
                    });
                });
            });
        });

        it('testRenameFolderLocal', function (done) {
            common.addDirectory(common.remoteTree, '/test', function () {
                common.addDirectory(common.localTree, '/test', function () {
                    common.testTree.rename('/test', '/test2', function (err) {
                        expect(err).toBeFalsy();
                        common.expectPathExist(common.remoteTree, '/test', false, function() {
                            common.expectPathExist(common.localTree, '/test', false, function () {
                                common.expectPathExist(common.remoteTree, '/test2', true, function() {
                                    common.expectPathExist(common.localTree, '/test2', true, done);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
