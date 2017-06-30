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
var RQTree = RQCommon.require(__dirname, '../../../../lib/backends/rq/tree');
var utils = RQCommon.require(__dirname, '../../../../lib/utils');

describe('RQTree', function () {
  var c;

  beforeEach(function () {
    c = new RQCommon();

    spyOn(c.remoteTree, 'list').andCallThrough();
  });

  describe('Exists', function () {
    it('testExistsFalse', function (done) {
      c.testTree.exists('/testfile', function (err, exists) {
        expect(err).toBeFalsy();
        expect(exists).toBeFalsy();
        done();
      });
    });

    it('testExistsRemoteOnly', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.exists('/testfile', function (err, exists) {
          expect(err).toBeFalsy();
          expect(exists).toBeTruthy();
          done();
        });
      });
    });

    it('testExistsLocalOnly', function (done) {
      c.addFile(c.localTree, '/testfile', function () {
        c.testTree.exists('/testfile', function (err, exists) {
          expect(err).toBeFalsy();
          expect(exists).toBeTruthy();
          done();
        });
      });
    });

    it('testExistsLocalAndRemote', function (done) {
      c.addFile(c.localTree, '/testFile', function () {
        c.addFile(c.remoteTree, '/testFile', function () {
          c.testTree.exists('/testFile', function (err, exists) {
            expect(err).toBeFalsy();
            expect(exists).toBeTruthy();
            done();
          });
        });
      });
    });

    it('testExistsDeleted', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.open('/testfile', function (err, rqfile) {
          expect(err).toBeFalsy();
          rqfile.cacheFile(function (err) {
            expect(err).toBeFalsy();
            rqfile.delete(function (err) {
              expect(err).toBeFalsy();
              c.expectQueuedMethod('/', 'testfile', 'DELETE', function () {
                c.testTree.exists('/testfile', function (err, exists) {
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

  describe('RefreshWorkFiles', function () {
    it('testRefreshWorkFiles', function (done) {
      c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
        setTimeout(function () {
          c.testTree.open('/testfile', function (err, rqFile) {
            rqFile.cacheFile(function (err, cached) {
              c.expectLocalFileExist('/testfile', true, false, function () {
                c.localRawTree.open('/testfile', function (err, localFile) {
                  c.localTree.open('/testfile', function (err, file) {
                    expect(err).toBeFalsy();
                    expect(file.getLastSyncDate()).toBeTruthy();
                    var lastSynced = file.getLastSyncDate();
                    var lastModified = file.lastModified();
                    expect(file.lastModified()).toEqual(remoteFile.lastModified());
                    setTimeout(function () {
                      // pause ever so slightly to allow time to change
                      c.testTree.refreshWorkFiles('/testfile', function (err) {
                        expect(err).toBeFalsy();
                        c.localTree.open('/testfile', function (err, file) {
                          expect(err).toBeFalsy();
                          expect(file.getLastSyncDate()).toBeGreaterThan(lastSynced);
                          expect(file.lastModified()).toEqual(localFile.lastModified());
                          done();
                        });
                      });
                    }, 10);
                  });
                });
              });
            });
          });
        }, 10);
      });
    });

    it('testRefreshWorkFilesMissing', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.addFile(c.localTree, '/testfile', function () {
          c.testTree.refreshWorkFiles('/testfile', function (err) {
            expect(err).toBeFalsy();
            done();
          });
        });
      });
    });
  });

  describe('CanDelete', function () {
    it('testCanDeleteRemoteOnlyPath', function (done) {
      c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
        c.testTree.canDelete('/testfile', function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeTruthy();
          done();
        });
      });
    });

    it('testCanDeleteRemoteOnlyFile', function (done) {
      c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
        c.testTree.canDelete('/testfile', function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeTruthy();
          done();
        });
      });
    });

    it('testCanDeleteDirectory', function (done) {
      c.addDirectory(c.localTree, '/test', function (dir) {
        c.testTree.canDelete('/test', function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeTruthy();
          c.testTree.canDelete('/test', function (err, canDelete) {
            expect(err).toBeFalsy();
            expect(canDelete).toBeTruthy();
            done();
          });
        });
      });
    });

    it('testCanDeleteFile', function (done) {
      c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
        c.testTree.open('/testfile', function (err, rqFile) {
          rqFile.cacheFile(function (err, localFile) {
            expect(err).toBeFalsy();
            c.testTree.canDelete('/testfile', function (err, canDelete) {
              expect(err).toBeFalsy();
              expect(canDelete).toBeTruthy();
              c.testTree.canDelete('/testfile', function (err, canDelete) {
                expect(canDelete).toBeTruthy();
                c.expectLocalFileExist('/testfile', true, false, done);
              });
            });
          });
        });
      });
    });

    it('testCanDeleteFileModified', function (done) {
      c.addFile(c.remoteTree, '/testfile', function (remoteFile) {
        c.testTree.open('/testfile', function (err, rqFile) {
          expect(err).toBeFalsy();
          rqFile.cacheFile(function (err, localFile) {
            expect(err).toBeFalsy();
            localFile.setLastModified(localFile.lastModified() + 10000);
            localFile.close(function (err) {
              expect(err).toBeFalsy();
              c.testTree.open('/testfile', function (err, rqFile) {
                expect(err).toBeFalsy();
                c.testTree.canDelete('/testfile', function (err, canDelete) {
                  expect(err).toBeFalsy();
                  expect(canDelete).toBeFalsy();
                  c.testTree.canDelete('/testfile', function (err, canDelete) {
                    expect(err).toBeFalsy();
                    expect(canDelete).toBeFalsy();
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

    it('testCanDeleteFileLocallyCreated', function (done) {
      c.addQueuedFile('/testfile', function (file) {
        c.testTree.canDelete('/testfile', function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeFalsy();
          c.expectLocalFileExist('/testfile', true, true, done);
        });
      });
    });

    it('testCanDeleteMissingWorkFile', function (done) {
      c.addFile(c.localTree, '/testfile', function () {
        c.testTree.canDelete('/testfile', function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeFalsy();
          done();
        });
      });
    });
  });

  describe('Open', function () {
    it('testOpenRemoteOnly', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.open('/testfile', function (err, file) {
          expect(err).toBeFalsy();
          expect(file).toBeDefined();
          done();
        });
      });
    });

    it('testOpenLocalOnly', function (done) {
      c.addQueuedFile('/testfile', function (file) {
        c.testTree.open('/testfile', function (err, file) {
          expect(err).toBeFalsy();
          expect(file).toBeDefined();
          done();
        });
      });
    });

    it('testOpenLocalAndRemote', function (done) {
      c.addFile(c.localTree, '/testfile', function () {
        c.addFile(c.remoteTree, '/testfile', function () {
          c.testTree.open('/testfile', function (err, file) {
            expect(err).toBeFalsy();
            expect(file).toBeDefined();
            done();
          });
        });
      });
    });
  });

  describe('List', function () {
    var expectHasFile = function (files, path) {
      var hasFile = false;
      if (files) {
        for (var i = 0; i < files.length; i++) {
          if (files[i].getPath() == path) {
            hasFile = true;
            break;
          }
        }
      }
      expect(hasFile).toBeTruthy();
    };

    it('testListRemoteOnly', function (done) {
      c.addFiles(c.remoteTree, 3, function () {
        c.testTree.list('/*', function (err, files) {
          expect(err).toBeFalsy();
          expectHasFile(files, '/testfile1');
          expectHasFile(files, '/testfile2');
          expectHasFile(files, '/testfile3');
          done();
        });
      });
    });

    it('testListLocalCreated', function (done) {
      c.addFile(c.remoteTree, '/testremote', function () {
        c.testTree.createFile('/testfile1', function (err, file) {
          expect(err).toBeFalsy();
          c.testTree.list('/*', function (err, files) {
            expect(err).toBeFalsy();
            expectHasFile(files, '/testremote');
            expectHasFile(files, '/testfile1');
            done();
          });
        });
      });
    });

    it('testListLocalNoCreatedUnsafeDelete', function (done) {
      var currTime = new Date().getTime();
      c.addLocalFileWithDates('/testlocal', false, 'content', currTime, currTime + 20000, function (file) {
        c.testTree.list('/*', function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(1);
          expect(c.testShare.emit.mostRecentCall.args[0]).toEqual('syncconflict');
          c.expectLocalFileExist('/testlocal', true, false, done);
        });
      });
    });

    it('testListLocalTempFile', function (done) {
      c.addFiles(c.remoteTree, 3, function () {
        c.addFile(c.localTree, '/.tempfile', function () {
          c.testTree.list('/*', function (err, files) {
            expect(err).toBeFalsy();
            expect(files.length).toEqual(4);
            expectHasFile(files, '/.tempfile');
            c.expectLocalFileExistExt('/.tempfile', true, false, false, done);
          });
        });
      });
    });

    it('testListRemoteDeletedLocally', function (done) {
      c.addFiles(c.remoteTree, 3, function () {
        c.testTree.delete('/testfile1', function (err) {
          expect(err).toBeFalsy();
          c.testTree.list('/*', function (err, files) {
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
      c.addFiles(c.remoteTree, 3, function () {
        c.addLocalFiles(3, function () {
          c.remoteTree.delete('/testfile1', function (err) {
            expect(err).toBeFalsy();
            c.testTree.list('/*', function (err, files) {
              expect(err).toBeFalsy();
              expect(files.length).toEqual(2);
              expectHasFile(files, '/testfile2');
              expectHasFile(files, '/testfile3');
              c.expectQueuedMethod('/', 'testfile1', false, function () {
                c.expectLocalFileExist('/testfile1', false, false, done);
              });
            });
          });
        });
      });
    });

    it('testListRemoteDeletedCantDelete', function (done) {
      var currTime = new Date().getTime();
      c.addFiles(c.remoteTree, 3, function () {
        c.addLocalFiles(2, function () {
          c.addLocalFileWithDates('/testfile3', false, 'content', currTime, currTime + 20000, function (file) {
            c.remoteTree.delete('/testfile3', function (err) {
              expect(err).toBeFalsy();
              c.testTree.list('/*', function (err, files) {
                expect(err).toBeFalsy();
                expect(files.length).toEqual(3);
                expectHasFile(files, '/testfile1');
                expectHasFile(files, '/testfile2');
                expectHasFile(files, '/testfile3');
                c.expectQueuedMethod('/', 'testfile3', false, function () {
                  expect(c.testShare.emit.mostRecentCall.args[0]).toEqual('syncconflict');
                  c.expectLocalFileExist('/testfile3', true, false, done);
                });
              });
            });
          });
        });
      });
    });

    it('testListRemoteDirectoryDeleted', function (done) {
      c.addFiles(c.remoteTree, 3, function () {
        c.addDirectory(c.remoteTree, '/test', function () {
          c.addDirectory(c.localTree, '/test', function () {
            c.remoteTree.deleteDirectory('/test', function (err) {
              expect(err).toBeFalsy();
              c.testTree.list('/*', function (err, items) {
                expect(err).toBeFalsy();
                expect(items.length).toEqual(3);
                expectHasFile(items, '/testfile1');
                expectHasFile(items, '/testfile2');
                expectHasFile(items, '/testfile3');
                c.expectPathExist(c.localTree, '/test', false, done);
              });
            });
          });
        });
      });
    });

    it('testListEncoding', function (done) {
      // 이두吏讀
      var remoteFileName = decodeURI('/%EC%9D%B4%EB%91%90%E5%90%8F%E8%AE%80.jpg');
      var localFileName = decodeURI('/%E1%84%8B%E1%85%B5%E1%84%83%E1%85%AE%E5%90%8F%E8%AE%80.jpg');
      c.addFile(c.remoteTree, remoteFileName, function () {
        c.addFile(c.localTree, localFileName, function () {
          c.localTree.open(localFileName, function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist(localFileName, true, false, function () {
              c.testTree.list('/*', function (err, files) {
                expect(err).toBeFalsy();
                expect(files.length).toEqual(1);
                c.expectLocalFileExist(localFileName, true, false, done);
              });
            });
          });
        });
      });
    });

    it('testListEncodingDeleted', function (done) {
      var remoteFileName = decodeURI('/%EC%9D%B4%EB%91%90%E5%90%8F%E8%AE%80.jpg');
      var localFileName = decodeURI('/%E1%84%8B%E1%85%B5%E1%84%83%E1%85%AE%E5%90%8F%E8%AE%80.jpg');
      c.addFile(c.remoteTree, remoteFileName, function () {
        c.addFile(c.localTree, localFileName, function () {
          c.localTree.open(localFileName, function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist(localFileName, true, false, function () {
              c.testTree.delete(localFileName, function (err) {
                c.testTree.list('/*', function (err, files) {
                  expect(err).toBeFalsy();
                  expect(files.length).toEqual(0);
                  c.expectLocalFileExist(localFileName, false, false, done);
                });
              });
            });
          });
        });
      });
    });

    it('testListCaching', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.list('/*', function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(1);
          expect(c.remoteTree.list.calls.length).toEqual(1);

          c.testTree.list('/*', function (err, files) {
            // should be cached now
            expect(err).toBeFalsy();
            expect(files.length).toEqual(1);
            expect(c.remoteTree.list.calls.length).toEqual(1);
            done();
          });
        });
      });
    });

    it('testListCachingExpired', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.list('/*', function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(1);
          expect(c.remoteTree.list.calls.length).toEqual(1);

          setTimeout(function () {
            c.testTree.list('/*', function (err, files) {
              expect(err).toBeFalsy();
              expect(files.length).toEqual(1);
              expect(c.remoteTree.list.calls.length).toEqual(2);
              done();
            });
          }, 500);
        });
      });
    });

    it('testListFileRemote', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.list('/testfile', function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(1);
          done();
        });
      });
    });

    it('testListFileLocal', function (done) {
      c.addFile(c.localTree, '/testfile', function () {
        c.testTree.list('/testfile', function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(1);
          done();
        });
      });
    });

    it('testListFileTempNoExist', function (done) {
      c.testTree.list('/.tempfile', function (err, files) {
        expect(err).toBeFalsy();
        expect(files.length).toEqual(0);
        expect(c.remoteTree.list).not.toHaveBeenCalled();
        done();
      });
    });

    it('testListDeletedFile', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.open('/testfile', function (err, rqfile) {
          expect(err).toBeFalsy();
          rqfile.cacheFile(function (err) {
            expect(err).toBeFalsy();
            rqfile.delete(function (err) {
              expect(err).toBeFalsy();
              c.expectQueuedMethod('/', 'testfile', 'DELETE', function () {
                c.testTree.list('/testfile', function (err, files) {
                  expect(err).toBeFalsy();
                  expect(files.length).toEqual(0);
                  done();
                });
              });
            });
          });
        });
      });
    });

    it('testListMissingWork', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.addFile(c.localTree, '/testfile', function () {
          c.testTree.list('/*', function (err, files) {
            expect(err).toBeFalsy();
            expect(files.length).toEqual(1);
            done();
          });
        });
      });
    });
  });

  describe('DeleteLocalDirectoryRecursive', function () {
    it('testDeleteLocalDirectoryRecursive', function (done) {
      c.addDirectory(c.localTree, '/removeme', function () {
        c.addLocalFile('/removeme/file1', function () {
          c.addDirectory(c.localTree, '/removeme/subfolder', function () {
            c.addLocalFile('/removeme/subfolder/file2', function () {
              c.testTree.deleteLocalDirectoryRecursive('/', function (err) {
                expect(err).toBeFalsy();
                c.expectPathExist(c.localTree, '/removeme', false, function () {
                  c.expectPathExist(c.localTree, '/removeme/subfolder', false, function () {
                    c.expectLocalFileExist('/removeme/file1', false, false, function () {
                      c.expectLocalFileExist('/removeme/subfolder/file2', false, false, function () {
                        c.expectPathExist(c.localTree, '/', true, done);
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

    it('testDeleteLocalDirectoryRecursiveCantDelete', function (done) {
      c.addDirectory(c.localTree, '/removeme', function () {
        c.addDirectory(c.localTree, '/removeme/sub', function () {
          c.addLocalFile('/removeme/sub/file1', function () {
            c.addLocalFile('/removeme/sub/file2', function () {
              c.localTree.open('/removeme/sub/file1', function (err, file) {
                expect(err).toBeFalsy();
                file.setLastModified(file.lastModified() + 100000);
                file.close(function (err) {
                  expect(err).toBeFalsy();
                  c.testTree.deleteLocalDirectoryRecursive('/removeme', function (err) {
                    expect(err).toBeFalsy();
                    c.expectPathExist(c.localTree, '/removeme', true, function () {
                      c.expectPathExist(c.localTree, '/removeme/sub', true, function () {
                        c.expectLocalFileExist('/removeme/sub/file1', true, false, function () {
                          c.expectLocalFileExist('/removeme/sub/file2', false, false, function () {
                            expect(c.testShare.emit.mostRecentCall.args[0]).toEqual('syncconflict');
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

    it('testDeleteLocalDirectoryRecursiveWork', function (done) {
      c.addDirectory(c.remoteTree, '/removeme', function () {
        c.addDirectory(c.remoteTree, '/removeme/sub', function () {
          c.addFile(c.remoteTree, '/removeme/file1', function () {
            c.addFile(c.remoteTree, '/removeme/sub/file2', function () {
              c.testTree.open('/removeme/file1', function (err, file) {
                expect(err).toBeFalsy();
                file.cacheFile(function (err, cached) {
                  expect(err).toBeFalsy();
                  cached.setLastModified(cached.lastModified() + 100000);
                  cached.close(function (err) {
                    expect(err).toBeFalsy();
                    c.testTree.open('/removeme/sub/file2', function (err, file) {
                      expect(err).toBeFalsy();
                      file.cacheFile(function (err, cached) {
                        c.addQueuedFile('/removeme/file3', function () {
                          c.testTree.deleteLocalDirectoryRecursive('/removeme', function (err) {
                            expect(err).toBeFalsy();
                            c.expectLocalFileExist('/remoteme/file3', false, false, function () {
                              expect(c.testShare.emit).toHaveBeenCalledWith('syncconflict', {path: '/removeme/file3'});
                              expect(c.testShare.emit.calls.length).toEqual(2);
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
  });

  describe('QueueData', function () {
    it('testQueueData', function (done) {
      c.testTree.queueData('/testfile', 'PUT', false, function (err) {
        expect(err).toBeFalsy();
        c.expectQueuedMethod('/', 'testfile', 'PUT', done);
      });
    });

    it('testQueueDataNewName', function (done) {
      c.testTree.queueData('/testfile', 'PUT', '/testfile2', function (err) {
        expect(err).toBeFalsy();
        c.expectQueuedMethod('/', 'testfile', 'PUT', done);
      });
    });

    it('testQueueDataTempFile', function (done) {
      c.testTree.queueData('/.tempfile', 'PUT', false, function (err) {
        expect(err).toBeFalsy();
        c.expectQueuedMethod('/', '.tempfile', false, done);
      });
    });

    it('testQueueDataTempFileDestTempFile', function (done) {
      c.testTree.queueData('/.tempfile', 'MOVE', '/.tempfile2', function (err) {
        expect(err).toBeFalsy();
        c.expectQueuedMethod('/', '.tempfile', false, function () {
          c.expectQueuedMethod('/', '.tempfile2', false, done);
        });
      });
    });

    it('testQueueDataTempFileDestNormalFile', function (done) {
      c.testTree.queueData('/.tempfile', 'MOVE', '/testfile', function (err) {
        expect(err).toBeFalsy();
        c.expectQueuedMethod('/', '.tempfile', false, function () {
          c.expectQueuedMethod('/', 'testfile', 'PUT', done);
        });
      });
    });

    it('testQueueDataNormalFileDestTempFile', function (done) {
      c.addQueuedFile('/testfile', function () {
        c.testTree.queueData('/testfile', 'MOVE', '/.tempfile', function (err) {
          expect(err).toBeFalsy();
          c.expectQueuedMethod('/', 'testfile', false, function () {
            c.expectQueuedMethod('/', '.tempfile', false, done);
          });
        });
      });
    });

    it('testQueueDataNormalFileDestNormalFile', function (done) {
      c.testTree.queueData('/testfile', 'MOVE', '/testfile2', function (err) {
        expect(err).toBeFalsy();
        c.expectQueuedMethod('/', 'testfile', 'DELETE', function () {
          c.expectQueuedMethod('/', 'testfile2', 'PUT', done);
        });
      });
    });

    it('testQueueDataCopyTempFileDestTempFile', function (done) {
      c.testTree.queueData('/.tempfile', 'COPY', '/.tempfile2', function (err) {
        expect(err).toBeFalsy();
        c.expectQueuedMethod('/', '.tempfile', false, function () {
          c.expectQueuedMethod('/', '.tempfile2', false, done);
        });
      });
    });

    it('testQueueDataCopyTempFileDestNormalFile', function (done) {
      c.testTree.queueData('/.tempfile', 'COPY', '/testfile', function (err) {
        expect(err).toBeFalsy();
        c.expectQueuedMethod('/', '.tempfile', false, function () {
          c.expectQueuedMethod('/', 'testfile', 'PUT', done);
        });
      });
    });

    it('testQueueDataCopyNormalFileDestTempFile', function (done) {
      c.addQueuedFile('/testfile', function () {
        c.testTree.queueData('/testfile', 'COPY', '/.tempfile', function (err) {
          expect(err).toBeFalsy();
          c.expectQueuedMethod('/', 'testfile', 'PUT', function () {
            c.expectQueuedMethod('/', '.tempfile', false, done);
          });
        });
      });
    });

    it('testQueueDataCopyNormalFileDestNormalFile', function (done) {
      c.testTree.queueData('/testfile', 'COPY', '/testfile2', function (err) {
        expect(err).toBeFalsy();
        c.expectQueuedMethod('/', 'testfile', false, function () {
          c.expectQueuedMethod('/', 'testfile2', 'PUT', done);
        });
      });
    });
  });

  it('testCreateFile', function (done) {
    c.testTree.createFile('/testfile1', function (err, file) {
      c.expectLocalFileExist('/testfile1', true, true, done);
    });
  });

  it('testCreateFileWorkExists', function (done) {
    c.addFile(c.localTree, '/.aem/testfile', function () {
      c.testTree.createFile('/testfile', function (err, file) {
        expect(err).toBeFalsy();
        c.expectLocalFileExist('/testfile', true, true, done);
      });
    });
  });

  it('testCreateDirectory', function (done) {
    c.testTree.createDirectory('/test', function (err, dir) {
      expect(err).toBeFalsy();
      expect(dir.isDirectory()).toBeTruthy();
      c.localTree.exists('/test', function (err, exists) {
        expect(err).toBeFalsy();
        expect(exists).toBeTruthy();
        c.remoteTree.exists('/test', function (err, exists) {
          expect(err).toBeFalsy();
          expect(exists).toBeTruthy();
          done();
        });
      });
    });
  });

  it('testCreateDirectoryTemp', function (done) {
    c.testTree.createDirectory('/.test', function (err, dir) {
      expect(err).toBeFalsy();
      expect(dir.isDirectory()).toBeTruthy();
      c.expectPathExist(c.localTree, '/.test', true, function () {
        c.expectPathExist(c.remoteTree, '/.test', false, done);
      });
    });
  });

  describe('Delete', function () {
    it('testDeleteLocalOnly', function (done) {
      c.testTree.createFile('/testfile', function (err, file) {
        expect(err).toBeFalsy();
        expect(file.isFile()).toBeTruthy();

        c.expectLocalFileExist('/testfile', true, true, function () {
          c.testTree.delete('/testfile', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExistExt('/testfile', false, false, false, function () {
              c.expectQueuedMethod('/', 'testfile', false, done);
            });
          });
        });
      });
    });

    it('testDeleteLocal', function (done) {
      c.addFile(c.remoteTree, '/testfile', function (file) {
        c.testTree.open('/testfile', function (err, rqFile) {
          expect(err).toBeFalsy();
          rqFile.cacheFile(function (err) {
            expect(err).toBeFalsy();
            c.testTree.delete('/testfile', function (err) {
              expect(err).toBeFalsy();
              c.expectLocalFileExistExt('/testfile', false, false, false, function () {
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
    });

    it('testDeleteRemoteOnly', function (done) {
      c.addFile(c.remoteTree, '/testfile', function (file) {
        c.testTree.delete('/testfile', function (err) {
          expect(err).toBeFalsy();
          c.remoteTree.exists('/testfile', function (err, exists) {
            expect(err).toBeFalsy();
            expect(exists).toBeTruthy();
            c.expectQueuedMethod('/', 'testfile', 'DELETE', done);
          });
        });
      });
    });

    it('testDeleteTempFile', function (done) {
      c.addFile(c.localTree, '/.tempfile.ext', function (file) {
        c.testTree.delete('/.tempfile.ext', function (err) {
          expect(err).toBeFalsy();
          c.expectQueuedMethod('/', '.tempfile.ext', false, done);
        });
      });
    });

    it('testDeleteMissingWork', function (done) {
      c.addFile(c.localTree, '/testfile', function () {
        c.testTree.delete('/testfile', function (err) {
          expect(err).toBeFalsy();
          c.expectLocalFileExist('/testfile', false, false, function () {
            c.expectQueuedMethod('/', 'testfile', 'DELETE', done);
          });
        });
      });
    });
  });

  describe('DeleteDirectory', function () {
    it('testDeleteDirectoryLocal', function (done) {
      c.testTree.createDirectory('/test', function (err) {
        expect(err).toBeFalsy();
        c.testTree.createFile('/test/testfile', function (err) {
          expect(err).toBeFalsy();
          c.testTree.delete('/test/testfile', function (err) {
            expect(err).toBeFalsy();
            c.testTree.deleteDirectory('/test', function (err) {
              expect(err).toBeFalsy();
              c.expectPathExist(c.remoteTree, '/test', false, function () {
                c.expectPathExist(c.localTree, '/test', false, function () {
                  c.expectPathExist(c.localRawTree, '/test/.aem', false, function () {
                    c.expectQueuedMethod('/test', 'testfile', false, done);
                  });
                });
              });
            });
          });
        });
      });
    });

    it('testDeleteDirectoryRemoteOnly', function (done) {
      c.addDirectory(c.remoteTree, '/test', function (dir) {
        c.testTree.deleteDirectory('/test', function (err) {
          expect(err).toBeUndefined();
          c.expectPathExist(c.remoteTree, '/test', false, done);
        });
      });
    });

    it('testDeleteDirectoryTempName', function (done) {
      c.addDirectory(c.localTree, '/.test', function () {
        c.testTree.deleteDirectory('/.test', function (err) {
          expect(err).toBeFalsy();
          c.expectPathExist(c.localTree, '/.test', false, function () {
            expect(c.remoteTree.deleteDirectory).not.toHaveBeenCalled();
            done();
          });
        });
      });
    });
  });

  describe('Rename', function () {
    it('testRenameLocalFile', function (done) {
      c.addQueuedFile('/testfile', function () {
        c.testTree.rename('/testfile', '/testfile2', function (err) {
          expect(err).toBeFalsy();
          c.expectLocalFileExist('/testfile', false, false, function () {
            c.expectLocalFileExist('/testfile2', true, true, function () {
              c.expectQueuedMethod('/', 'testfile2', 'PUT', function () {
                c.expectQueuedMethod('/', 'testfile', false, done);
              });
            });
          });
        });
      });
    });

    it('testRenameFileRemoteOnly', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.rename('/testfile', '/testfile2', function (err) {
          expect(err).toBeFalsy();
          c.expectPathExist(c.remoteTree, '/testfile', false, function () {
            c.expectPathExist(c.remoteTree, '/testfile2', true, done);
          });
        });
      });
    });

    it('testRenameFolderRemoteOnly', function (done) {
      c.addDirectory(c.remoteTree, '/test', function () {
        c.testTree.rename('/test', '/test2', function (err) {
          expect(err).toBeFalsy();
          c.expectPathExist(c.remoteTree, '/test', false, function () {
            c.expectPathExist(c.remoteTree, '/test2', true, done);
          });
        });
      });
    });

    it('testRenameFolderLocal', function (done) {
      c.addDirectory(c.remoteTree, '/test', function () {
        c.addDirectory(c.localTree, '/test', function () {
          c.testTree.rename('/test', '/test2', function (err) {
            expect(err).toBeFalsy();
            c.expectPathExist(c.remoteTree, '/test', false, function () {
              c.expectPathExist(c.localTree, '/test', false, function () {
                c.expectPathExist(c.remoteTree, '/test2', true, function () {
                  c.expectPathExist(c.localTree, '/test2', true, done);
                });
              });
            });
          });
        });
      });
    });

    it('testRenameFolderToTemp', function (done) {
      c.addDirectory(c.remoteTree, '/test', function () {
        c.addDirectory(c.localTree, '/test', function () {
          c.testTree.rename('/test', '/.test', function (err) {
            c.expectPathExist(c.remoteTree, '/test', true, function () {
              c.expectPathExist(c.remoteTree, '/.test', false, function () {
                c.expectPathExist(c.localTree, '/test', false, function () {
                  c.expectPathExist(c.localTree, '/.test', true, done);
                });
              });
            });
          });
        });
      });
    });

    it('testRenameFolderFromTemp', function (done) {
      c.addDirectory(c.remoteTree, '/.test', function () {
        c.addDirectory(c.localTree, '/.test', function () {
          c.testTree.rename('/.test', '/test', function (err) {
            c.expectPathExist(c.remoteTree, '/.test', true, function () {
              c.expectPathExist(c.remoteTree, '/test', false, function () {
                c.expectPathExist(c.localTree, '/.test', false, function () {
                  c.expectPathExist(c.localTree, '/test', true, done);
                });
              });
            });
          });
        });
      });
    });

    it('testRenameFolderMissingWork', function (done) {
      c.addDirectory(c.remoteTree, '/test', function () {
        c.addDirectory(c.localTree, '/test', function () {
          c.testTree.rename('/test', '/test2', function (err) {
            expect(err).toBeFalsy();
            c.expectPathExist(c.localTree, '/test2', true, done);
          });
        });
      });
    });

    it('testRenameFileMissingWork', function (done) {
      c.addFile(c.localTree, '/testfile', function () {
        c.testTree.rename('/testfile', '/testfile2', function (err) {
          expect(err).toBeFalsy();
          c.expectLocalFileExistExt('/testfile2', true, true, true, done);
        });
      });
    });

    it('testRenameOverwrite', function (done) {
      c.testTree.createFile('/destfile', function (err, file) {
        expect(err).toBeFalsy();
        c.addFile(c.remoteTree, '/somefile', function () {
          c.testTree.open('/somefile', function (err, file) {
            expect(err).toBeFalsy();
            file.cacheFile(function (err) {
              expect(err).toBeFalsy();
              c.testTree.rename('/somefile', '/destfile', function (err) {
                expect(err).toBeFalsy();
                c.expectLocalFileExist('/destfile', true, true, function () {
                  c.expectLocalFileExist('/somefile', false, false, done);
                });
              });
            });
          });
        });
      });
    });
  });

  describe('TempFiles', function () {
    it('testTempFileExists', function (done) {
      c.addFile(c.localTree, '/.temp', function () {
        c.testTree.exists('/.temp', function (err, exists) {
          expect(err).toBeFalsy();
          expect(exists).toBeTruthy();
          expect(c.remoteTree.exists).not.toHaveBeenCalled();
          done();
        });
      });
    });

    it('testTempFileNoExist', function (done) {
      c.testTree.exists('/.temp', function (err, exists) {
        expect(err).toBeFalsy();
        expect(exists).toBeFalsy();
        expect(c.remoteTree.exists).not.toHaveBeenCalled();
        done();
      });
    });

    it('testOpenTempFile', function (done) {
      c.addFile(c.localTree, '/.temp', function () {
        c.testTree.open('/.temp', function (err, file) {
          expect(err).toBeFalsy();
          expect(file).toBeDefined();
          expect(c.remoteTree.open).not.toHaveBeenCalled();
          done();
        });
      });
    });

    it('testOpenTempFileNoExist', function (done) {
      c.testTree.open('/.temp', function (err, file) {
        expect(err).toBeTruthy();
        expect(c.remoteTree.open).not.toHaveBeenCalled();
        done();
      });
    });

    it('testListTempFile', function (done) {
      c.addFile(c.localTree, '/.temp', function () {
        c.addFile(c.remoteTree, '/file', function () {
          c.testTree.list('/*', function (err, files) {
            expect(err).toBeFalsy();
            expect(files.length).toEqual(2);
            done();
          });
        });
      });
    });

    it('testListTempFileOnly', function (done) {
      c.addFile(c.localTree, '/.temp', function () {
        c.testTree.list('/.temp', function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(1);
          expect(c.remoteTree.list).not.toHaveBeenCalled();
          done();
        });
      });
    });

    it('testCreateFileTempFile', function (done) {
      c.testTree.createFile('/.temp', function (err, file) {
        expect(err).toBeFalsy();
        expect(file).toBeDefined();
        c.expectLocalFileExistExt('/.temp', true, false, false, done);
      });
    });

    it('testDeleteTempFile', function (done) {
      c.addFile(c.localTree, '/.temp', function () {
        c.testTree.delete('/.temp', function (err) {
          expect(err).toBeFalsy();
          expect(c.remoteTree.delete).not.toHaveBeenCalled();
          c.expectLocalFileExist('/.temp', false, false, done);
        });
      });
    });

    it('testDeleteTempFileNoExist', function (done) {
      c.testTree.delete('/.temp', function (err) {
        expect(err).toBeTruthy();
        expect(c.remoteTree.delete).not.toHaveBeenCalled();
        done();
      });
    });

    it('testRenameQueuedToTempFile', function (done) {
      c.addQueuedFile('/file', function () {
        c.testTree.rename('/file', '/.temp', function (err) {
          expect(err).toBeFalsy();
          c.expectQueuedMethod('/', 'file', false, function () {
            c.expectLocalFileExistExt('/.temp', true, false, false, function () {
              c.expectLocalFileExist('/file', false, false, done);
            });
          });
        });
      });
    });

    it('testRenameCachedToTempFile', function (done) {
      c.addFile(c.remoteTree, '/file', function () {
        c.testTree.open('/file', function (err, file) {
          expect(err).toBeFalsy();
          file.cacheFile(function (err) {
            expect(err).toBeFalsy();
            c.testTree.rename('/file', '/.temp', function (err) {
              expect(err).toBeFalsy();
              c.expectQueuedMethod('/', 'file', 'DELETE', function () {
                c.expectLocalFileExistExt('/.temp', true, false, false, function () {
                  c.expectLocalFileExist('/file', false, false, done);
                });
              });
            });
          });
        });
      });
    });

    it('testRenameTempToNormal', function (done) {
      c.addFile(c.localTree, '/.temp', function () {
        c.testTree.rename('/.temp', '/file', function (err) {
          expect(err).toBeFalsy();
          c.expectQueuedMethod('/', 'file', 'PUT', function () {
            c.expectLocalFileExist('/.temp', false, false, function () {
              c.expectLocalFileExist('/file', true, true, done);
            });
          });
        });
      });
    });
  });

  describe('ConcurrencyTests', function () {
    it('testOpenDownloadingFile', function (done) {
      // in this test we're creating a situation where a file is in the process of being downloaded, and another
      // "thread" attempts to open the file. we're ensuring that if this happens then we don't end up with a file
      // whose length is incorrect
      c.setPipeDelay(function (delayCb) {
        // a second thread attempts to open the same file before the fetch is complete
        c.testTree.open('/somefile', function (err, testFile) {
          expect(err).toBeFalsy();
          expect(testFile.size()).toEqual('/somefile'.length);
          delayCb();
        });
      });
      c.addFileWithContent(c.remoteTree, '/somefile', '/somefile', function () {
        c.testTree.open('/somefile', function (err, file) {
          expect(err).toBeFalsy();
          // flush the file to force a cache of the file
          file.flush(function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/somefile', true, false, function () {
              c.localRawTree.open('/somefile', function (err, fetched) {
                expect(err).toBeFalsy();
                // set the fetched file's length to 1 to simulate that the file isn't completely downloaded
                fetched.setLength(1, function (err) {
                  expect(err).toBeFalsy();
                  fetched.close(function (err) {
                    expect(err).toBeFalsy();
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

    it('testMultipleDownloadFile', function (done) {
      // this test verifies the case where multiple "threads" attempt to download the same file
      c.setPipeDelay(function (delayCb) {
        // a second thread attempts to download the same file before the first fetch is complete
        c.testTree.open('/multiplefile', function (err, testFile) {
          expect(err).toBeFalsy();
          testFile.flush(function (err) {
            expect(err).toBeFalsy();
            c.testTree.open('/multiplefile', function (err, verifyFile) {
              expect(err).toBeFalsy();
              expect(verifyFile.size()).toEqual(100);
              delayCb();
            });
          });
        });
      });

      // first "thread" downloads the file
      c.addFileWithContent(c.remoteTree, '/multiplefile', '/multiplefile', function () {
        c.testTree.open('/multiplefile', function (err, file) {
          expect(err).toBeFalsy();
          file.setLength(100, function (err) {
            expect(err).toBeFalsy();
            expect(file.size()).toEqual(100);
            file.close(function (err) {
              expect(err).toBeFalsy();
              c.expectLocalFileExist('/multiplefile', true, false, function () {
                done();
              });
            });
          });
        });
      });
    });
  });

  describe('DateTests', function () {
    it('testLastModifiedCachedFile', function (done) {
      c.addFileWithDates(c.remoteTree, '/testfile', 'content', 123456, 123459, function () {
        c.testTree.open('/testfile', function (err, file) {
          expect(err).toBeFalsy();
          file.cacheFile(function (err) {
            expect(err).toBeFalsy();
            file.close(function (err) {
              expect(err).toBeFalsy();
              c.testTree.open('/testfile', function (err, file) {
                expect(err).toBeFalsy();
                expect(file.lastModified()).toEqual(123459);
                done();
              })
            });
          });
        });
      });
    });

    it('testRevertedRemoteVersion', function (done) {
      c.addCachedFile('/testfile', function () {
        c.remoteTree.open('/testfile', function (err, file) {
          expect(err).toBeFalsy();
          var prevModified = file.lastModified();
          var newModified = file.lastModified() - 2000;
          file.setLastModified(newModified);
          file.close(function (err) {
            expect(err).toBeFalsy();
            c.testTree.open('/testfile', function (err, file) {
              expect(err).toBeFalsy();
              expect(file.lastModified()).toEqual(prevModified);
              file.cacheFile(function (err) {
                expect(err).toBeFalsy();
                expect(file.lastModified()).toEqual(newModified);
                done();
              });
            });
          });
        });
      });
    });

    it('testListDates', function (done) {
      function verifyListDates(file1, file2, cb) {
        c.testTree.list('/*', function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(2);

          var list1 = files[0];
          var list2 = files[1];

          if (list1.getPath() == file2.getPath()) {
            var swap = list1;
            list1 = list2;
            list2 = swap;
          }

          expect(list1.lastModified()).toEqual(file1.lastModified());
          expect(list2.lastModified()).toEqual(file2.lastModified());
          cb();
        });
      }

      function verifySingleDate(toVerify, cb) {
        c.testTree.list(toVerify.getPath(), function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(1);
          expect(files[0].lastModified()).toEqual(toVerify.lastModified());
          cb();
        });
      }

      // this test will make sure that file dates remain the same in list view after caching files.
      c.addFile(c.remoteTree, '/testfile1', function () {
        c.addFile(c.remoteTree, '/testfile2', function () {
          c.testTree.open('/testfile1', function (err, file1) {
            expect(err).toBeFalsy();
            c.testTree.open('/testfile2', function (err, file2) {
              expect(err).toBeFalsy();
              verifyListDates(file1, file2, function () {
                verifySingleDate(file1, function () {
                  verifySingleDate(file2, function () {
                    file1.cacheFile(function (err) {
                      expect(err).toBeFalsy();
                      c.testTree.open(file1.getPath(), function (err, file1) {
                        expect(err).toBeFalsy();
                        verifyListDates(file1, file2, function () {
                          verifySingleDate(file1, function () {
                            verifySingleDate(file2, done);
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

  describe('IllustratorTests', function () {
    function saveIllustratorFile(savePath, expectedMethod, cb) {
      var savePathParent = utils.getParentPath(savePath);
      var savePathName = utils.getPathName(savePath);
      var savePathTemp = savePathParent + '/.' + savePathName;
      // "save" the illustrator file by moving it to a temp file, then moving it back
      c.testTree.open(savePath, function (err, origFile) {
        expect(err).toBeFalsy();
        c.testTree.rename(savePath, savePathTemp, function (err) {
          expect(err).toBeFalsy();
          c.expectLocalFileExist(savePath, false, false, function () {
            c.expectLocalFileExistExt(savePathTemp, true, false, false, function () {
              c.expectQueuedMethod(savePathParent, savePathName, expectedMethod == 'POST' ? 'DELETE' : false, function () {
                c.testTree.rename(savePathTemp, savePath, function (err) {
                  expect(err).toBeFalsy();
                  c.expectLocalFileExist(savePath, true, expectedMethod == 'POST' ? false: true, function () {
                    c.expectLocalFileExist(savePathTemp, false, false, function () {
                      c.expectQueuedMethod(savePathParent, savePathName, expectedMethod, function () {
                        c.testTree.open(savePath, function (err, file) {
                          expect(err).toBeFalsy();
                          if (expectedMethod == 'PUT') {
                            expect(origFile.created()).not.toEqual(file.created());
                          } else {
                            expect(origFile.created()).toEqual(file.created());
                          }
                          expect(origFile.lastModified()).not.toEqual(file.lastModified());
                          cb();
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
    }
    it('testIllustratorCreate', function (done) {
      // create a new file
      c.addQueuedFile('/test', function () {
        saveIllustratorFile('/test', 'PUT', done);
      });
    });

    it('testIllustratorUpdate', function (done) {
      c.addCachedFile('/test', function () {
        saveIllustratorFile('/test', 'POST', done);
      });
    });
  });

  describe('CacheInfoOnly', function () {
    beforeEach(function () {
      c.testTree.config.noUnicodeNormalize = true;
      c.testTree.local.cacheInfoOnly = true;
      c.testTree.local.config.noUnicodeNormalize = true;
      c.testTree.local.source.config.noUnicodeNormalize = true;
    });

    function _addQueuedCacheInfoOnlyFile(path, cb) {
      c.addRawLocalFile(path, function () {
        c.testTree.createFile(path, function (err, file) {
          expect(err).toBeFalsy();
          file.close(function (err) {
            expect(err).toBeFalsy();
            cb(file);
          });
        });
      });
    }

    function _addCachedCacheInfoOnlyFile(path, cb) {
      c.addFile(c.remoteTree, path, function () {
        c.testTree.open(path, function (err, file) {
          expect(err).toBeFalsy();
          c.expectLocalFileExist(path, false, false, function () {
            file.cacheFile(function (err) {
              expect(err).toBeFalsy();
              c.expectLocalFileExistExt(path, true, true, false, function () {
                cb();
              });
            });
          });
        });
      });
    }

    it('testCreateFile', function (done) {
      _addQueuedCacheInfoOnlyFile('/test', function (file) {
        expect(file.isDirectory()).toBeFalsy();
        expect(file.isFile()).toBeTruthy();
        c.expectLocalFileExist('/test', true, true, function () {
          c.expectQueuedMethod('/', 'test', 'PUT', done);
        });
      });
    });

    it('testCreateDirectory', function (done) {
      c.localRawTree.createDirectory('/test', function (err) {
        expect(err).toBeFalsy();
        c.testTree.createDirectory('/test', function (err) {
          expect(err).toBeFalsy();
          c.remoteTree.exists('/test', function (err, exists) {
            expect(err).toBeFalsy();
            expect(exists).toBeTruthy();
            done();
          });
        });
      });
    });

    it('testRenameFile', function (done) {
      _addCachedCacheInfoOnlyFile('/test', function () {
        c.localRawTree.rename('/test', '/test2', function (err) {
          expect(err).toBeFalsy();
          c.testTree.rename('/test', '/test2', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/test', false, false, function () {
              c.expectLocalFileExist('/test2', true, true, function () {
                c.expectQueuedMethod('/', 'test', 'DELETE', function () {
                  c.expectQueuedMethod('/', 'test2', 'PUT', done);
                });
              });
            });
          });
        });
      });
    });

    it('testRenameFileExisting', function (done) {
      _addCachedCacheInfoOnlyFile('/test', function () {
        _addCachedCacheInfoOnlyFile('/test2', function () {
          c.localRawTree.rename('/test', '/test2', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExistExt('/test', false, true, false, function () {
              c.expectQueuedMethod('/', 'test', false, function () {
                c.testTree.rename('/test', '/test2', function (err) {
                  expect(err).toBeFalsy();
                  c.expectLocalFileExist('/test', false, false, function () {
                    c.expectLocalFileExist('/test2', true, false, function () {
                      c.expectQueuedMethod('/', 'test2', 'POST', done);
                    });
                  });
                });
              });
            });
          });
        });
      });
    });

    it('testRenameDirectory', function (done) {
      c.localRawTree.createDirectory('/test', function (err) {
        expect(err).toBeFalsy();
        c.testTree.createDirectory('/test', function (err) {
          expect(err).toBeFalsy();
          _addCachedCacheInfoOnlyFile('/test/testfile', function () {
            c.localRawTree.rename('/test', '/test2', function (err) {
              expect(err).toBeFalsy();
              c.expectLocalFileExist('/test2/testfile', true, false, function () {
                c.testTree.rename('/test', '/test2', function (err) {
                  expect(err).toBeFalsy();
                  c.remoteTree.exists('/test2', function (err, exists) {
                    expect(err).toBeFalsy();
                    expect(exists).toBeTruthy();
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

    it('testRenameDirectoryLocalOnly', function (done) {
      c.testTree.rename('/test', '/test2', function (err) {
        expect(err).toBeFalsy();
        done();
      });
    });

    it('testDeleteFile', function (done) {
      _addQueuedCacheInfoOnlyFile('/test', function () {
        c.localRawTree.delete('/test', function (err) {
          expect(err).toBeFalsy();
          c.expectLocalFileExistExt('/test', false, true, true, function () {
            c.expectQueuedMethod('/', 'test', 'PUT', function () {
              c.testTree.delete('/test', function (err) {
                expect(err).toBeFalsy();
                c.expectLocalFileExist('/test', false, false, function () {
                  c.expectQueuedMethod('/', 'test', false, done);
                });
              });
            });
          });
        });
      });
    });

    it('testDeleteDirectory', function (done) {
      c.localTree.deleteDirectory('/test', function (err) {
        expect(err).toBeFalsy();
        done();
      });
    });

    it('testUpdateFile', function (done) {
      _addCachedCacheInfoOnlyFile('/test', function () {
        c.testTree.open('/test', function (err, file) {
          expect(err).toBeFalsy();
          file.setLength(100, function (err) {
            expect(err).toBeFalsy();
            file.close(function (err) {
              expect(err).toBeFalsy();
              c.testTree.open('/test', function (err, file) {
                expect(err).toBeFalsy();
                expect(file.size()).toEqual(0);
                c.expectQueuedMethod('/', 'test', 'POST', done);
              });
            });
          });
        });
      });
    });

    it('testRenameTempToNotTemp', function (done) {
      _addQueuedCacheInfoOnlyFile('/test', function () {
        c.localRawTree.rename('/test', '/.temp', function (err) {
          expect(err).toBeFalsy();
          c.testTree.rename('/test', '/.temp', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/test', false, false, function () {
              c.expectLocalFileExistExt('/.temp', true, false, false, function () {
                c.expectQueuedMethod('/', 'test', false, function () {
                  c.localRawTree.rename('/.temp', '/test', function (err) {
                    expect(err).toBeFalsy();
                    c.testTree.rename('/.temp', '/test', function (err) {
                      expect(err).toBeFalsy();
                      c.expectLocalFileExist('/.temp', false, false, function () {
                        c.expectLocalFileExist('/test', true, true, function () {
                          c.expectQueuedMethod('/', 'test', 'PUT', done);
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

    it('testEncoding', function (done) {
      var encodedNameRaw = '%EC%9D%B4%EB%91%90%E5%90%8F%E8%AE%80';
      var encodedName = decodeURI(encodedNameRaw);
      var encoded = '/' + encodedName;
      expect(encodeURI(encodedName)).toEqual(encodedNameRaw);
      _addQueuedCacheInfoOnlyFile(encoded, function () {
        c.expectLocalFileExist(encoded, true, true, function () {
          c.expectQueuedMethod('/', encodedName, 'PUT', done);
        });
      });
    });
  });
});
