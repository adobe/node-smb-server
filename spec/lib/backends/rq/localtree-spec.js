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

describe('LocalTreeTests', function () {
  var c;

  beforeEach(function () {
    c = new RQCommon();
  });

  it('testCacheInfoExists', function (done) {
    c.localTree.cacheInfoExists('/test', function (err, exists) {
      expect(err).toBeFalsy();
      expect(exists).toBeFalsy();
      c.addFile(c.localRawTree, '/.aem/test.json', function () {
        c.localTree.cacheInfoExists('/test', function (err, exists) {
          expect(err).toBeFalsy();
          expect(exists).toBeTruthy();
          done();
        });
      });
    });
  });

  it('testGetInfoFilePath', function () {
    expect(c.localTree.getInfoFilePath('/test')).toEqual('/.aem/test.json');
  });

  describe('Downloading', function () {
    it('testIsDownloading', function () {
      expect(c.localTree.isDownloading('/testfile')).toBeFalsy();
      c.localTree.setDownloading('/testfile', true);
      expect(c.localTree.isDownloading('/testfile')).toBeTruthy();
      c.localTree.setDownloading('/testfile', false);
      expect(c.localTree.isDownloading('/testfile')).toBeFalsy();
    });

    it('testDownloadingMultiple', function () {
      c.localTree.setDownloading('/testfile', false);
      expect(c.localTree.isDownloading('/testfile')).toBeFalsy();
      c.localTree.setDownloading('/testfile', true);
      expect(c.localTree.isDownloading('/testfile')).toBeTruthy();
    });

    it('testWaitDownload', function (done) {
      var waited = false;
      c.localTree.setDownloading('/testfile', true);
      c.localTree.waitOnDownload('/testfile', function (err) {
        expect(err).toBeFalsy();
        expect(waited).toBeTruthy();

        // it shouldn't wait a second time
        c.localTree.waitOnDownload('/testfile', function (err) {
          expect(err).toBeFalsy();
          done();
        });
      });

      setTimeout(function () {
        waited = true;
        c.localTree.setDownloading('/testfile', false);
      }, 500);
    });

    it('testWaitDownloadNotDownloading', function (done) {
      c.localTree.waitOnDownload('/testfile', function (err) {
        expect(err).toBeFalsy();
        done();
      });
    });

    it('testDownload', function (done) {
      c.addFile(c.remoteTree, '/test', function () {
        c.expectLocalFileExist('/test', false, false, function () {
          c.localTree.download(c.remoteTree, '/test', function (err, file) {
            expect(err).toBeFalsy();
            expect(file).toBeTruthy();
            c.expectLocalFileExistExt('/test', true, true, false, done);
          });
        });
      });
    });
  });

  describe('RefreshCacheInfo', function () {
    it('testRefreshCacheInfo', function (done) {
      c.addFile(c.remoteTree, '/test', function (remote) {
        c.localTree.createFile('/test', function (err, local) {
          expect(err).toBeFalsy();
          var lastModified = local.lastModified();
          var lastSynced = local.getLastSyncDate();
          expect(lastModified).toBeTruthy();
          expect(lastSynced).toBeTruthy();
          expect(local.getDownloadedRemoteModifiedDate()).toBeFalsy();
          expect(local.isCreatedLocally()).toBeTruthy();
          setTimeout(function () {
            c.localTree.refreshCacheInfo('/test', remote, function (err) {
              expect(err).toBeFalsy();
              c.localTree.open('/test', function (err, local) {
                expect(err).toBeFalsy();
                expect(local.lastModified()).toEqual(local.lastModified());
                expect(local.getLastSyncDate()).not.toEqual(lastSynced);
                expect(local.getDownloadedRemoteModifiedDate()).toEqual(remote.lastModified());
                expect(local.isCreatedLocally()).toBeFalsy();
                done();
              });
            });
          }, 5);
        });
      });
    });

    it('testRefreshCacheInfoAfterUpdate', function (done) {
      // verify that if a remote file is updated to a local version, the local modified date is still used
      c.addFile(c.remoteTree, '/test', function (remote) {
        c.localTree.download(c.remoteTree, '/test', function (err, local) {
          expect(err).toBeFalsy();
          local.setLastModified(local.lastModified() + 10);
          var localModified = local.lastModified();
          local.close(function (err) {
            expect(err).toBeFalsy();
            remote.setLastModified(local.lastModified() + 10);
            remote.close(function (err) {
              expect(err).toBeFalsy();
              c.localTree.refreshCacheInfo('/test', remote, function (err) {
                expect(err).toBeFalsy();
                c.localTree.open('/test', function (err, local) {
                  expect(err).toBeFalsy();
                  expect(local.lastModified()).toEqual(localModified);
                  done();
                });
              });
            });
          });
        });
      });
    });

    it('testRefreshCacheInfoNoExist', function (done) {
      c.addFile(c.remoteTree, '/test', function (remote) {
        c.addFile(c.localRawTree, '/test', function () {
          c.localTree.refreshCacheInfo('/test', remote, function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/test', true, false, done);
          });
        });
      });
    });
  });

  describe('CreateFile', function () {
    it('testCreateFromSource', function (done) {
      c.addFile(c.remoteTree, '/test', function (remote) {
        c.addFile(c.localRawTree, '/test', function (file) {
          c.addFile(c.localRawTree, '/test2', function (file2) {
            c.localTree.createFromSource(file, remote, true, function (err, local) {
              expect(err).toBeFalsy();
              expect(local).toBeTruthy();
              expect(local.getDownloadedRemoteModifiedDate()).toEqual(remote.lastModified());
              expect(local.isCreatedLocally()).toBeTruthy();
              remote.setLastModified(12345);
              c.expectLocalFileExist('/test', true, true, function () {
                c.localTree.createFromSource(file, remote, false, function (err, local2) {
                  expect(err).toBeFalsy();
                  expect(local2).toBeTruthy();
                  expect(local2.getDownloadedRemoteModifiedDate()).toEqual(local.getDownloadedRemoteModifiedDate());
                  expect(local2.isCreatedLocally()).toBeTruthy();
                  c.expectLocalFileExist('/test', true, true, function () {
                    c.localTree.createFromSource(file2, remote, false, function (err, local3) {
                      expect(err).toBeFalsy();
                      expect(local3).toBeTruthy();
                      expect(local3.getDownloadedRemoteModifiedDate()).toEqual(12345);
                      expect(local3.isCreatedLocally()).toBeFalsy();
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

    it('testCreateFromSourceDir', function (done) {
      c.addDirectory(c.remoteTree, '/test', function (remote) {
        c.addDirectory(c.localRawTree, '/test', function (dir) {
          c.localTree.createFromSource(dir, remote, true, function (err, local) {
            expect(err).toBeFalsy();
            expect(local).toBeTruthy();
            expect(local.getDownloadedRemoteModifiedDate()).toBeFalsy();
            expect(local.isCreatedLocally()).toBeFalsy();
            c.expectLocalFileExistExt('/test', true, false, false, done);
          });
        });
      });
    });

    it('testCreateFromSourceTempFile', function (done) {
      c.addFile(c.remoteTree, '/.test', function (remote) {
        c.addFile(c.localRawTree, '/.test', function (file) {
          c.localTree.createFromSource(file, remote, true, function (err, local) {
            expect(err).toBeFalsy();
            expect(local).toBeTruthy();
            expect(local.getDownloadedRemoteModifiedDate()).toBeFalsy();
            expect(local.isCreatedLocally()).toBeFalsy();
            c.expectLocalFileExistExt('/.test', true, false, false, done);
          });
        });
      });
    });
  });

  it('testExists', function (done) {
    c.localTree.exists('/test', function (err, exists) {
      expect(err).toBeFalsy();
      expect(exists).toBeFalsy();
      c.addFile(c.localTree, '/test', function () {
        c.localTree.exists('/test', function (err, exists) {
          expect(err).toBeFalsy();
          expect(exists).toBeTruthy();
          done();
        });
      });
    });
  });

  describe('OpenTest', function () {
    it('testOpen', function (done) {
      c.localTree.createFile('/test', function (err) {
        expect(err).toBeFalsy();
        c.localTree.open('/test', function (err, file) {
          expect(err).toBeFalsy();
          expect(file).toBeTruthy();
          c.expectLocalFileExistExt('/test', true, true, true, done);
        });
      });
    });

    it('testOpenNoExist', function (done) {
      c.localTree.open('/test', function (err) {
        expect(err).toBeTruthy();
        done();
      });
    });

    it('testOpenNoWork', function (done) {
      c.addFile(c.localRawTree, '/test', function () {
        c.localTree.open('/test', function (err, file) {
          expect(err).toBeFalsy();
          expect(file).toBeTruthy();
          c.expectLocalFileExistExt('/test', true, true, false, done);
        });
      });
    });
  });

  describe('ListTest', function () {
    it('testList', function (done) {
      c.localTree.createFile('/test', function (err) {
        expect(err).toBeFalsy();
        c.localTree.createFile('/test2', function (err) {
          expect(err).toBeFalsy();
          c.localTree.list('/*', function (err, files) {
            expect(err).toBeFalsy();
            expect(files.length).toEqual(2);
            expect(files[0].isCreatedLocally()).toBeTruthy();
            expect(files[1].isCreatedLocally()).toBeTruthy();
            expect(files[0].getPath()).not.toEqual(files[1].getPath());
            done();
          });
        });
      });
    });

    it('testListDangling', function (done) {
      c.addFile(c.localRawTree, '/test', function () {
        c.expectLocalFileExistExt('/test', true, false, false, function () {
          c.localTree.list('/*', function (err, files) {
            expect(err).toBeFalsy();
            expect(files.length).toEqual(1);
            expect(files[0].isCreatedLocally()).toBeFalsy();
            c.expectLocalFileExistExt('/test', true, true, false, done);
          });
        });
      });
    });

    it('testListMix', function (done) {
      c.addDirectory(c.localTree, '/test', function () {
        c.addFile(c.localTree, '/file', function () {
          c.addFile(c.localTree, '/.tempfile', function () {
            c.localTree.list('/*', function (err, files) {
              expect(err).toBeFalsy();
              expect(files.length).toEqual(3);
              expect(files[0].isCreatedLocally()).toBeFalsy();
              expect(files[1].isCreatedLocally()).toBeFalsy();
              expect(files[2].isCreatedLocally()).toBeFalsy();
              expect(files[0].getPath()).not.toEqual(files[1].getPath());
              expect(files[0].getPath()).not.toEqual(files[2].getPath());
              expect(files[1].getPath()).not.toEqual(files[2].getPath());
              c.expectLocalFileExistExt('/test', true, false, false, function () {
                c.expectLocalFileExistExt('/file', true, true, false, function () {
                  c.expectLocalFileExistExt('/.tempfile', true, false, false, done);
                });
              });
            });
          });
        });
      });
    });

    it('testListOneItem', function (done) {
      var validateItem = function (name, workExist, cb) {
        c.localTree.list(name, function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(1);
          expect(files[0].isCreatedLocally()).toBeFalsy();
          expect(files[0].getPath()).toEqual(name);
          c.expectLocalFileExistExt(name, true, workExist, false, cb);
        });
      };

      c.addDirectory(c.localTree, '/test', function () {
        c.addFile(c.localTree, '/file', function () {
          c.addFile(c.localTree, '/.tempfile', function () {
            validateItem('/test', false, function () {
              validateItem('/file', true, function () {
                validateItem('/.tempfile', false, done);
              });
            });
          });
        });
      });
    });

    it('testListEmpty', function (done) {
      c.localTree.list('/*', function (err, files) {
        expect(err).toBeFalsy();
        expect(files.length).toEqual(0);
        c.localTree.list('/test/*', function (err, files) {
          expect(err).toBeFalsy();
          expect(files.length).toEqual(0);
          c.localTree.list('/test', function (err, files) {
            expect(err).toBeFalsy();
            expect(files.length).toEqual(0);
            done();
          });
        });
      });
    });
  });

  describe('Create', function () {
    it('testCreateFile', function (done) {
      c.localTree.createFile('/test', function (err, file) {
        expect(err).toBeFalsy();
        expect(file).toBeTruthy();
        expect(file.getDownloadedRemoteModifiedDate()).toBeFalsy();
        expect(file.isCreatedLocally()).toBeTruthy();
        c.expectLocalFileExistExt('/test', true, true, true, done);
      });
    });

    it('testCreateFileWorkAlreadyExist', function (done) {
      c.addFile(c.remoteTree, '/test', function (remote) {
        c.addFile(c.localRawTree, '/test', function (file) {
          c.localTree.createFromSource(file, remote, false, function (err) {
            expect(err).toBeFalsy();
            c.localRawTree.delete('/test', function (err) {
              expect(err).toBeFalsy();
              c.expectLocalFileExistExt('/test', false, true, false, function () {
                c.localTree.createFile('/test', function (err, file) {
                  expect(err).toBeFalsy();
                  expect(file.getDownloadedRemoteModifiedDate()).toBeFalsy();
                  expect(file.isCreatedLocally()).toBeTruthy();
                  done();
                });
              });
            });
          });
        });
      });
    });

    it('testCreateDirectory', function (done) {
      c.localTree.createDirectory('/test', function (err, file) {
        expect(err).toBeFalsy();
        expect(file.isDirectory()).toBeTruthy();
        c.expectLocalFileExistExt('/test', true, false, false, done);
      });
    });
  });

  describe('Delete', function () {
    it('testDelete', function (done) {
      c.localTree.createFile('/test', function (err) {
        expect(err).toBeFalsy();
        c.localTree.delete('/test', function (err) {
          expect(err).toBeFalsy();
          c.expectLocalFileExistExt('/test', false, false, false, done);
        });
      });
    });

    it('testDeleteNoExist', function (done) {
      c.addFile(c.localRawTree, '/test', function () {
        c.expectLocalFileExistExt('/test', true, false, false, function () {
          c.localTree.delete('/test', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/test', false, false, function () {
              c.localTree.delete('/test', function (err) {
                expect(err).toBeTruthy();
                done();
              });
            });
          });
        });
      });
    });

    it('testDeleteDirectory', function (done) {
      c.localTree.createDirectory('/test', function (err) {
        expect(err).toBeFalsy();
        c.localTree.createFile('/test/file', function (err) {
          expect(err).toBeFalsy();
          c.localTree.delete('/test/file', function (err) {
            expect(err).toBeFalsy();
            c.localTree.deleteDirectory('/test', function (err) {
              expect(err).toBeFalsy();
              c.expectLocalFileExist('/test', false, false, function () {
                c.localRawTree.exists('/test/.aem', function (err, exists) {
                  expect(err).toBeFalsy();
                  expect(exists).toBeFalsy();
                  c.localTree.deleteDirectory('/test', function (err) {
                    expect(err).toBeTruthy();
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

    it('testDeleteDirectoryNotEmpty', function (done) {
      c.localTree.createDirectory('/test', function (err) {
        expect(err).toBeFalsy();
        c.localTree.createFile('/test/file', function (err) {
          expect(err).toBeFalsy();
          c.localTree.deleteDirectory('/test', function (err) {
            expect(err).toBeTruthy();
            c.expectLocalFileExist('/test/file', true, true, function () {
              c.localRawTree.delete('/test/file', function (err) {
                expect(err).toBeFalsy();
                c.localTree.deleteDirectory('/test', function (err) {
                  expect(err).toBeFalsy();
                  c.localRawTree.exists('/test/.aem', function (err, exists) {
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

  describe('Rename', function () {
    it('testRename', function (done) {
      c.localTree.createFile('/test', function (err) {
        expect(err).toBeFalsy();
        c.localTree.rename('/test', '/test2', function (err) {
          expect(err).toBeFalsy();
          c.expectLocalFileExist('/test', false, false, function () {
            c.expectLocalFileExist('/test2', true, true, done);
          });
        });
      });
    });

    it('testRenameNoWork', function (done) {
      c.addFile(c.localRawTree, '/test', function () {
        c.expectLocalFileExistExt('/test', true, false, false, function () {
          c.localTree.rename('/test', '/test1', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/test', false, false, function () {
              c.expectLocalFileExistExt('/test1', true, true, true, done);
            });
          });
        });
      });
    });

    it('testRenameTargetWorkExists', function (done) {
      c.localTree.createFile('/test', function (err) {
        expect(err).toBeFalsy();
        c.addFile(c.localRawTree, c.localTree.getInfoFilePath('/test1'), function () {
          c.expectLocalFileExist('/test', true, true, function () {
            c.expectLocalFileExistExt('/test1', false, true, false, function () {
              c.localTree.rename('/test', '/test1', function (err) {
                expect(err).toBeFalsy();
                c.expectLocalFileExist('/test', false, false, function () {
                  c.expectLocalFileExist('/test1', true, true, done);
                });
              });
            });
          });
        });
      });
    });

    it('testRenameTempToReal', function (done) {
      c.localTree.createFile('/.temp', function (err) {
        expect(err).toBeFalsy();
        c.expectLocalFileExistExt('/.temp', true, false, false, function () {
          c.localTree.rename('/.temp', '/file', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/.temp', false, false, function () {
              c.expectLocalFileExist('/file', true, true, done);
            });
          });
        });
      });
    });

    it('testRenameRealToTemp', function (done) {
      c.testTree.createFile('/file', function (err, file) {
        expect(err).toBeFalsy();
        c.testTree.rename('/file', '/.temp', function (err) {
          expect(err).toBeFalsy();
          c.expectLocalFileExist('/file', false, false, function () {
            c.expectLocalFileExistExt('/.temp', true, false, false, done);
          });
        });
      });
    });

    it('testRenameQueuedFile', function (done) {
      c.addQueuedFile('/testnewfile', function () {
        c.addFile(c.remoteTree, '/testfile', function () {
          c.testTree.open('/testfile', function (err, file) {
            expect(err).toBeFalsy();
            file.cacheFile(function (err) {
              expect(err).toBeFalsy();
              c.testTree.delete('/testfile', function (err) {
                expect(err).toBeFalsy();
                c.testTree.rename('/testnewfile', '/testfile', function (err) {
                  expect(err).toBeFalsy();
                  c.expectLocalFileExist('/testnewfile', false, false, function () {
                    c.expectLocalFileExistExt('/testfile', true, true, false, function () {
                      c.expectQueuedMethod('/', 'testfile', 'POST', function () {
                        c.expectQueuedMethod('/', 'testnewfile', false, done);
                      })
                    });
                  });
                });
              });
            });
          });
        });
      });
    });

    it('testRenameQueuedFileCached', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.open('/testfile', function (err, file) {
          expect(err).toBeFalsy();
          file.cacheFile(function (err) {
            expect(err).toBeFalsy();
            c.addFile(c.remoteTree, '/testfile1', function () {
              c.testTree.open('/testfile1', function (err, file) {
                expect(err).toBeFalsy();
                file.cacheFile(function (err) {
                  expect(err).toBeFalsy();
                  c.testTree.delete('/testfile1', function (err) {
                    expect(err).toBeFalsy();
                    c.testTree.rename('/testfile', '/testfile1', function (err) {
                      expect(err).toBeFalsy();
                      c.expectLocalFileExist('/testfile', false, false, function () {
                        c.expectLocalFileExistExt('/testfile1', true, true, false, function () {
                          c.expectQueuedMethod('/', 'testfile', 'DELETE', function () {
                            c.expectQueuedMethod('/', 'testfile1', 'POST', done);
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

    it('testRenameFileExisting', function (done) {
      c.addFile(c.remoteTree, '/testfile', function () {
        c.testTree.open('/testfile', function (err, file) {
          expect(err).toBeFalsy();
          file.cacheFile(function (err) {
            expect(err).toBeFalsy();
            c.addFile(c.remoteTree, '/testfile1', function () {
              c.testTree.open('/testfile1', function (err, file) {
                expect(err).toBeFalsy();
                file.cacheFile(function (err) {
                  expect(err).toBeFalsy();
                  c.testTree.rename('/testfile', '/testfile1', function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExist('/testfile', false, false, function () {
                      c.expectLocalFileExistExt('/testfile1', true, true, false, function () {
                        c.expectQueuedMethod('/', 'testfile', 'DELETE', function () {
                          c.expectQueuedMethod('/', 'testfile1', 'POST', done);
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

    it('testRenameTempToExisting', function (done) {
      c.addCachedFile('/testfile', function () {
        c.testTree.createFile('/.temp', function (err, file) {
          expect(err).toBeFalsy();
          c.testTree.rename('/.temp', '/testfile', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/.temp', false, false, function () {
              c.expectLocalFileExistExt('/testfile', true, true, false, function () {
                c.expectQueuedMethod('/', 'testfile', 'POST', done);
              });
            });
          });
        });
      });
    });

    it('testRenameToExistingQueued', function (done) {
      c.addQueuedFile('/testfile', function () {
        c.addQueuedFile('/testfile1', function () {
          c.testTree.rename('/testfile', '/testfile1', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/testfile', false, false, function () {
              c.expectLocalFileExist('/testfile1', true, true, function () {
                c.expectQueuedMethod('/', 'testfile', false, function () {
                  c.expectQueuedMethod('/', 'testfile1', 'PUT', done);
                });
              });
            });
          });
        });
      });
    });

    it('testRenameTempToExistingCreated', function (done) {
      c.addFile(c.localTree, '/.temp', function () {
        c.addQueuedFile('/testfile', function () {
          c.testTree.rename('/.temp', '/testfile', function (err) {
            expect(err).toBeFalsy();
            c.expectLocalFileExist('/.temp', false, false, function () {
              c.expectLocalFileExist('/testfile', true, true, function () {
                c.expectQueuedMethod('/', '.temp', false, function () {
                  c.expectQueuedMethod('/', 'testfile', 'PUT', done);
                });
              });
            });
          });
        });
      });
    });
  });

  it('testDisconnect', function (done) {
    c.localTree.disconnect(function (err) {
      expect(err).toBeFalsy();
      done();
    });
  });
});
