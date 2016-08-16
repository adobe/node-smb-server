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

var RQCommon = require('./rq-common');
var RQFile = require('../../../../lib/backends/rq/file');

describe('RQFile', function () {

    var c;

    beforeEach(function () {
        c = new RQCommon();
    });

    describe('CreateInstance', function () {
        it('testCreateInstanceFromRemote', function (done) {
           c.addFile(c.remoteTree, '/testfile', function (file) {
                var remoteFile = RQFile.createInstanceFromRemote('/testfile', c.testTree, file);
                c.expectRemoteFile(remoteFile);
                done();
            });
        });

        it('testCreateInstanceFromLocal', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                RQFile.createInstanceFromLocal('/testfile', c.testTree, file, function (err, localFile) {
                    c.expectLocalFile(localFile);
                    done();
                });
            });
        });

        it('testCreateInstanceFromLocalAndRemote', function (done) {
            c.addFile(c.localTree, '/testfile', function (localFile) {
                c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
                    RQFile.createInstanceFromLocalAndRemote('/testfile', c.testTree, localFile, remoteFile, function (err, file) {
                        c.expectLocalRemoteFile(file);
                        done();
                    });
                });
            });
        });

        it('testCreateInstance', function (done) {
            c.addFile(c.remoteTree, '/testfile', function () {
                RQFile.createInstance('/testfile', c.testTree, function (err, file) {
                    expect(err).toBeFalsy();
                    c.expectRemoteFile(file);
                    done();
                });
            });
        });
    });

    describe('DeleteWorkFiles', function () {
        it('testDeleteWorkFiles', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                RQFile.deleteWorkFiles('/testfile', c.testTree, function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExistExt('/testfile', true, false, false, done);
                });
            });
        });

        it('testDeleteWorkFilesCreateDateOnly', function (done) {
            c.addFile(c.localTree, '/testfile', function () {
                c.addFile(c.workTree, '/testfile', function () {
                    RQFile.deleteWorkFiles('/testfile', c.testTree, function (err) {
                        expect(err).toBeFalsy();
                        c.expectLocalFileExistExt('/testfile', true, false, false, done);
                    });
                });
            });
        });

        it('testDeleteWorkFilesCreatedOnly', function (done) {
            c.addFile(c.localTree, '/testfile', function () {
                c.addFile(c.workTree, c.testTree.getCreateFileName('/testfile'), function () {
                    RQFile.deleteWorkFiles('/testfile', c.testTree, function (err) {
                        expect(err).toBeFalsy();
                        c.expectLocalFileExistExt('/testfile', true, false, false, done);
                    });
                });
            });
        });

        it('testDeleteWorkFilesNone', function (done) {
            c.addFile(c.localTree, '/testfile', function () {
                RQFile.deleteWorkFiles('/testfile', c.testTree, function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExistExt('/testfile', true, false, false, done);
                });
            });
        });
    });

    describe('ProcessCreatedFile', function () {
        it('testProcessCreatedFileNotExists', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                var rqfile = new RQFile('/testfile', c.testTree, null, file);
                rqfile.processCreatedFile(function (err, createdFile) {
                    expect(err).toBeFalsy();
                    expect(createdFile.getPath()).toEqual('/testfile');
                    c.expectLocalFileExist('/testfile', true, false, done);
                });
            });
        });

        it('testProcessCreatedFileExists', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                var rqfile = new RQFile('/testfile', c.testTree, null, file);
                c.addFile(c.workTree, '/testfile', function (workFile) {
                    rqfile.processCreatedFile(function (err, createdFile) {
                        expect(err).toBeFalsy();
                        expect(createdFile.getPath()).toEqual('/testfile');
                        c.expectLocalFileExist('/testfile', true, false, done);
                    });
                });
            });
        });

        it('testProcessCreatedFileTempFile', function (done) {
            c.addFile(c.localTree, '/.tempfile', function (file) {
                var rqfile = new RQFile('/.tempfile', c.testTree, null, file);
                rqfile.processCreatedFile(function (err, createdFile) {
                    expect(err).toBeFalsy();
                    expect(createdFile.getPath()).toEqual('/.tempfile');
                    c.expectLocalFileExistExt('/.tempfile', true, false, false, done);
                });
            });
        });

        it('testProcessCreatedFileFolder', function (done) {
            c.addDirectory(c.localTree, '/test', function (file) {
                var rqfile = new RQFile('/test', c.testTree, null, file);
                rqfile.processCreatedFile(function (err, createdFile) {
                    expect(err).toBeFalsy();
                    expect(createdFile).toBeFalsy();
                    c.expectLocalFileExistExt('/test', true, false, false, done);
                });
            });
        });
    });

    describe('GetFile', function () {
        it('testGetFileLocalOnly', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                RQFile.createInstanceFromLocal('/testfile', c.testTree, file, function (err, rqFile) {
                    expect(err).toBeFalsy();
                    var endFile = rqFile.getFile();
                    expect(endFile.getPath()).toEqual('/testfile');
                    done();
                });
            });
        });

        it('testGetFileRemoteOnly', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (file) {
                var rqFile = RQFile.createInstanceFromRemote('/testfile', c.testTree, file);
                var endFile = rqFile.getFile();
                expect(endFile.getPath()).toEqual('/testfile');
                done();
            });
        });

        it('testGetFileRemoteAndLocal', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
                    RQFile.createInstanceFromLocalAndRemote('/testfile', c.testTree, file, remoteFile, function (err, rqFile) {
                        expect(err).toBeFalsy();
                        var endFile = rqFile.getFile();
                        expect(endFile.getPath()).toEqual('/testfile');
                        done();
                    });
                });
            });
        });
    });

    describe('CacheFile', function () {
        it('testCacheFileNoLocal', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (file) {
                var rqFile = RQFile.createInstanceFromRemote('/testfile', c.testTree, file);
                rqFile.cacheFile(function (err, localFile) {
                    expect(err).toBeFalsy();
                    expect(localFile.getPath()).toEqual('/testfile');
                    c.expectLocalFileExist('/testfile', true, false, done);
                });
            });
        });

        it('testCacheFileLocalFileNoRemoteChange', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
                var rqFile = RQFile.createInstanceFromRemote('/testfile', c.testTree, remoteFile);
                rqFile.cacheFile(function (err, localFile) {
                    expect(err).toBeFalsy();
                    rqFile.cacheFile(function (err, newLocalFile) {
                        expect(err).toBeFalsy();
                        expect(localFile.created()).toEqual(newLocalFile.created());
                        expect(localFile.lastModified()).toEqual(newLocalFile.lastModified());
                        done();
                    });
                });
            });
        });

        it('testCacheFileLocalFileRemoteChanged', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
                var rqFile = RQFile.createInstanceFromRemote('/testfile', c.testTree, remoteFile);
                rqFile.cacheFile(function (err, localFile) {
                    expect(err).toBeFalsy();
                    remoteFile.setLastModified(remoteFile.lastModified() + 100000);
                    rqFile.cacheFile(function (err, newLocalFile) {
                        expect(err).toBeFalsy();
                        expect(localFile.created()).not.toEqual(newLocalFile.created());
                        expect(localFile.lastModified()).not.toEqual(newLocalFile.lastModified());
                        done();
                    });
                });
            });
        });

        it('testCacheFileLocalFileRemoteChangedCantDelete', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
                var rqFile = RQFile.createInstanceFromRemote('/testfile', c.testTree, remoteFile);
                rqFile.cacheFile(function (err, localFile) {
                    expect(err).toBeFalsy();
                    remoteFile.setLastModified(remoteFile.lastModified() + 100000);
                    localFile.setLastModified(localFile.lastModified() + 10000);
                    rqFile.cacheFile(function (err, newLocalFile) {
                        expect(err).toBeFalsy();
                        expect(localFile.created()).toEqual(newLocalFile.created());
                        expect(localFile.lastModified()).toEqual(newLocalFile.lastModified());
                        expect(c.testShare.emit.mostRecentCall.args[0]).toEqual('syncconflict');
                        done();
                    });
                });
            });
        });

        it('testCacheFileLocalFileOnly', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                file.cacheFile(function (err, cached) {
                    expect(err).toBeFalsy();
                    expect(cached.lastModified()).toEqual(file.lastModified());
                    c.expectPathExist(c.remoteTree, '/testfile', false, done);
                });
            });
        });
    });

    describe('CanDelete', function () {
        it('testCanDeleteRemoteOnly', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
                var rqFile = RQFile.createInstanceFromRemote('/testfile', c.testTree, remoteFile);
                rqFile.canDelete(function (err, canDelete) {
                    expect(err).toBeFalsy();
                    expect(canDelete).toBeTruthy();
                    done();
                });
            });
        });

        it('testCanDeleteDirectory', function (done) {
            c.addDirectory(c.localTree, '/test', function (dir) {
                RQFile.createInstanceFromLocal('/test', c.testTree, dir, function (err, rqFile) {
                    rqFile.canDelete(function (err, canDelete) {
                        expect(err).toBeFalsy();
                        expect(canDelete).toBeTruthy();
                        done();
                    });
                });
            });
        });

        it('testCanDeleteFile', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
                var rqFile = RQFile.createInstanceFromRemote('/testfile', c.testTree, remoteFile);
                rqFile.cacheFile(function (err, localFile) {
                    expect(err).toBeFalsy();
                    rqFile.canDelete(function (err, canDelete) {
                        expect(err).toBeFalsy();
                        expect(canDelete).toBeTruthy();
                        c.expectLocalFileExist('/testfile', true, false, done);
                    });
                });
            });
        });

        it('testCanDeleteFileModified', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
                var rqFile = RQFile.createInstanceFromRemote('/testfile', c.testTree, remoteFile);
                rqFile.cacheFile(function (err, localFile) {
                    expect(err).toBeFalsy();
                    localFile.setLastModified(localFile.lastModified() + 10000);
                    rqFile.canDelete(function (err, canDelete) {
                        expect(err).toBeFalsy();
                        expect(canDelete).toBeFalsy();
                        done();
                    });
                });
            });
        });

        it('testCanDeleteFileLocallyCreated', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                RQFile.createInstanceFromLocal('/testfile', c.testTree, file, function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.canDelete(function (err, canDelete) {
                        expect(err).toBeFalsy();
                        expect(canDelete).toBeFalsy();
                        c.expectLocalFileExist('/testfile', true, true, done);
                    });
                });
            });
        });
    });

    describe('AccessMethods', function() {
        it('testFileAccessMethods', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    expect(rqFile.isFile()).toBeTruthy();
                    expect(rqFile.isDirectory()).toBeFalsy();
                    expect(rqFile.isReadOnly()).toBeFalsy();
                    expect(rqFile.size()).toEqual('/testfile'.length);
                    expect(rqFile.allocationSize()).toEqual(rqFile.size());
                    expect(rqFile.lastModified()).toBeGreaterThan(0);
                    var newModified = rqFile.lastModified() + 100;
                    rqFile.setLastModified(newModified);
                    expect(rqFile.lastModified()).toEqual(newModified);
                    expect(rqFile.lastChanged()).toBeGreaterThan(0);
                    expect(rqFile.lastAccessed()).toBeGreaterThan(0);
                    expect(rqFile.created()).toBeGreaterThan(0);
                    done();
                });
            });
        });

        it('testDirectoryAccessMethods', function (done) {
            c.addDirectory(c.localTree, '/test', function (dir) {
                c.testTree.open('/test', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    expect(rqFile.isFile()).toBeFalsy();
                    expect(rqFile.isDirectory()).toBeTruthy();
                    expect(rqFile.isReadOnly()).toBeFalsy();
                    expect(rqFile.lastModified()).toBeGreaterThan(0);
                    expect(rqFile.lastChanged()).toBeGreaterThan(0);
                    expect(rqFile.created()).toBeGreaterThan(0);
                    done();
                });
            });
        });
    });

    describe('Read', function () {
        it('testReadNotCached', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();

                    var buffer = new Array(rqFile.size());
                    rqFile.read(buffer, 0, 10000, 0, function (err, actual, readBytes) {
                        expect(err).toBeFalsy();
                        expect(buffer.join('')).toEqual('/testfile');
                        expect(readBytes.join('')).toEqual('/testfile');
                        expect(actual).toEqual(9);
                        done();
                    });
                });
            });
        });

        it('testReadAlreadyCached', function (done) {
            c.addFile(c.localTree, '/testfile', function () {
                c.testTree.open('/testfile', function (err, rqFile) {
                    var buffer = new Array(rqFile.size());
                    buffer[0] = '/';
                    buffer[rqFile.size() - 1] = 'e';
                    rqFile.read(buffer, 1, rqFile.size() - 2, 1, function (err, actual, readBytes) {
                        expect(err).toBeFalsy();
                        expect(buffer.join('')).toEqual('/testfile');
                        expect(readBytes.join('')).toEqual('testfil');
                        expect(actual).toEqual(7);
                        done();
                    });
                });
            });
        });
    });

    describe('Write', function () {
        it('testWriteNotCached', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.write('0', 0, function (err) {
                        expect(err).toBeFalsy();
                        var buffer = new Array(rqFile.size());
                        rqFile.read(buffer, 0, 10000, 0, function (err, actual, readBytes) {
                            expect(err).toBeFalsy();
                            expect(buffer.join('')).toEqual('0testfile');
                            rqFile.close(function (err) {
                                expect(err).toBeFalsy();
                                c.localTree.open('/testfile', function (err, localFile) {
                                    expect(err).toBeFalsy();
                                    expect(localFile.data.content.join('')).toEqual('0testfile');
                                    c.remoteTree.open('/testfile', function (err, remoteFile) {
                                        expect(err).toBeFalsy();
                                        expect(remoteFile.data.content).toEqual('/testfile');
                                        done();
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

        it('testWriteAlreadyCached', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.write('T', 1, function (err) {
                        expect(err).toBeFalsy();
                        var buffer = new Array(rqFile.size());
                        rqFile.read(buffer, 0, 10000, 0, function (err) {
                            expect(err).toBeFalsy();
                            expect(buffer.join('')).toEqual('/Testfile');
                            rqFile.close(function (err) {
                                expect(err).toBeFalsy();
                                c.localTree.open('/testfile', function (err, localFile) {
                                    expect(err).toBeFalsy();
                                    expect(localFile.data.content).toEqual('/Testfile');
                                    c.remoteTree.exists('/testfile', function (err, exists) {
                                        expect(err).toBeFalsy();
                                        expect(exists).toBeFalsy();
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

    describe('SetLength', function () {
        it('testSetLengthNotCached', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.setLength(10, function (err) {
                        expect(err).toBeFalsy();
                        rqFile.close(function (err) {
                            expect(err).toBeFalsy();
                            c.localTree.exists('/testfile', function (err, exists) {
                                expect(err).toBeFalsy();
                                expect(exists).toBeTruthy();
                                done();
                            });
                        });
                    });
                });
            });
        });

        it('testSetLengthAlreadyCached', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.setLength(10, function (err) {
                        expect(err).toBeFalsy();
                        rqFile.close(function (err) {
                            expect(err).toBeFalsy();
                            c.remoteTree.exists('/testfile', function (err, exists) {
                                expect(err).toBeFalsy();
                                expect(exists).toBeFalsy();
                                done();
                            });
                        });
                    });
                });
            });
        });
    });

    describe('Delete', function () {
        it('testDeleteFileRemoteOnly', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    c.localTree.exists('/testfile', function (err, exists) {
                        expect(err).toBeFalsy();
                        expect(exists).toBeFalsy();
                        rqFile.delete(function (err) {
                            expect(err).toBeFalsy();
                            c.remoteTree.exists('/testfile', function (err, exists) {
                                expect(err).toBeFalsy();
                                expect(exists).toBeTruthy();
                                c.expectQueuedMethod('/', 'testfile', 'DELETE', done);
                            });
                        });
                    });
                });
            });
        });

        it('testDeleteFileLocalOnly', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExist('/testfile', true, false, function () {
                        rqFile.delete(function (err) {
                            expect(err).toBeFalsy();
                            c.expectLocalFileExist('/testfile', false, false, done);
                        });
                    });
                });
            });
        });

        it('testDeleteFileQueuedLocally', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExist('/testfile', true, true, function () {
                        c.expectQueuedMethod('/', 'testfile', 'PUT', function () {
                            rqFile.delete(function (err) {
                                expect(err).toBeFalsy();
                                c.expectLocalFileExist('/testfile', false, false, function () {
                                    c.expectQueuedMethod('/', 'testfile', false, done);
                                });
                            });
                        });
                    });
                });
            });
        });

        it('testDeleteFileLocalAndRemote', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (file) {
                c.addFile(c.localTree, '/testfile', function (file) {
                    c.testTree.open('/testfile', function (err, rqFile) {
                        c.expectLocalFileExist('/testfile', true, false, function () {
                            rqFile.delete(function (err) {
                                expect(err).toBeFalsy();
                                c.expectLocalFileExist('/testfile', false, false, function () {
                                    c.remoteTree.exists('/testfile', function (err, exists) {
                                        expect(err).toBeFalsy();
                                        expect(exists).toBeTruthy();
                                        c.expectQueuedMethod('/', 'testfile', 'DELETE', done);
                                    });
                                });
                            })
                        });
                    });
                });
            });
        });

        it('testDeleteFolderRemoteOnly', function (done) {
            c.addDirectory(c.remoteTree, '/test', function (dir) {
                c.testTree.open('/test', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.delete(function (err) {
                        expect(err).toBeFalsy();
                        c.remoteTree.exists('/test', function (err, exists) {
                            expect(err).toBeFalsy();
                            expect(exists).toBeFalsy();
                            done();
                        });
                    });
                });
            });
        });

        it('testDeleteFolderLocalAndRemote', function (done) {
            c.addDirectory(c.localTree, '/test', function (dir) {
                c.addDirectory(c.remoteTree, '/test', function (dir) {
                    c.testTree.open('/test', function (err, rqFile) {
                        expect(err).toBeFalsy();
                        rqFile.delete(function (err) {
                            expect(err).toBeFalsy();
                            c.localTree.exists('/test', function (err, exists) {
                                expect(err).toBeFalsy();
                                expect(exists).toBeFalsy();
                                c.remoteTree.exists('/test', function (err, exists) {
                                    expect(err).toBeFalsy();
                                    expect(exists).toBeFalsy();
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        it('testDeleteFileLocalNotQueued', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    c.addFile(c.workTree, c.testTree.getCreateFileName('/testfile'), function (file) {
                        c.expectLocalFileExist('/testfile', true, true, function () {
                            c.expectQueuedMethod('/', 'testfile', false, function () {
                                rqFile.delete(function (err) {
                                    expect(err).toBeFalsy();
                                    c.expectLocalFileExist('/testfile', false, false, function () {
                                        c.expectQueuedMethod('/', 'testfile', false, function () {
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

    describe('Flush', function () {
        it('testFlushNoCache', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    rqFile.flush(function (err) {
                        expect(err).toBeFalsy();
                        c.expectLocalFileExist('/testfile', true, false, done);
                    });
                });
            });
        });

        it('testFlushAlreadyCached', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                file.flush(function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExist('/testfile', true, true, done);
                });
            });
        });
    });

    describe('Close', function () {
        it('testCloseRemoteOnly', function (done) {
            c.addFile(c.remoteTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.close(function (err) {
                        expect(err).toBeFalsy();
                        c.expectQueuedMethod('/', 'testfile', false, function () {
                            c.expectLocalFileExist('/testfile', false, false, done);
                        });
                    });
                });
            });
        });

        it('testCloseLocalOnly', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.close(function (err) {
                        c.expectQueuedMethod('/', 'testfile', false, function () {
                            c.expectLocalFileExist('/testfile', true, false, done);
                        });
                    });
                });
            });
        });

        it('testCloseLocalAndRemote', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.addFile(c.remoteTree, '/testfile', function (file) {
                    c.testTree.open('/testfile', function (err, rqFile) {
                        expect(err).toBeFalsy();
                        rqFile.close(function (err) {
                            c.expectQueuedMethod('/', 'testfile', false, function () {
                                c.expectLocalFileExist('/testfile', true, false, done);
                            });
                        });
                    });
                });
            });
        });

        it('testCloseCreated', function (done) {
            c.testTree.createFile('/testfile', function (err, file) {
                expect(err).toBeFalsy();
                c.expectLocalFileExist('/testfile', true, true, function () {
                    c.expectQueuedMethod('/', 'testfile', false, function () {
                        file.setLength(10, function (err) {
                            expect(err).toBeFalsy();
                            file.close(function (err) {
                                expect(err).toBeFalsy();
                                c.expectQueuedMethod('/', 'testfile', 'PUT', done);
                            });
                        });
                    });
                });
            });
        });

        it('testCloseUpdated', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.setLength(10, function (err) {
                        expect(err).toBeFalsy();
                        rqFile.close(function (err) {
                            expect(err).toBeFalsy();
                            c.expectQueuedMethod('/', 'testfile', 'POST', done);
                        });
                    });
                });
            });
        });

        it('testCloseDeleted', function (done) {
            c.addFile(c.localTree, '/testfile', function (file) {
                c.testTree.open('/testfile', function (err, rqFile) {
                    expect(err).toBeFalsy();
                    rqFile.setLength(10, function (err) {
                        expect(err).toBeFalsy();
                        rqFile.delete(function (err) {
                            expect(err).toBeFalsy();
                            rqFile.close(function (err) {
                                expect(err).toBeFalsy();
                                c.expectLocalFileExist('/testfile', false, false, function () {
                                    c.expectQueuedMethod('/', 'testfile', 'DELETE', done);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
