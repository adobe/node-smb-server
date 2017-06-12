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

var RQLocalFile = require('../../../../lib/backends/rq/localfile');

describe('LocalFileTest', function () {
  var c;

  beforeEach(function () {
    c = new RQCommon();
  });

  function _getCacheInfo(localLastModified, remoteLastModified, created) {
    return _getCacheInfoExt(localLastModified, 0, 0, 0, remoteLastModified, 0, 0, 0, created);
  }

  function _getCacheInfoExt(
    localLastModified,
    localLastChanged,
    localCreated,
    localLastAccessed,
    remoteLastModified,
    remoteLastChanged,
    remoteCreated,
    remoteLastAccessed,
    created) {

    var data = {
      local: {
        lastModified: localLastModified,
        lastChanged: localLastChanged,
        created: localCreated,
        lastAccessed: localLastAccessed
      },
      created: created,
      synced: new Date().getTime()
    };

    if (remoteLastModified || remoteLastChanged || remoteCreated || remoteLastAccessed) {
      data['remote'] = {
        lastModified: remoteLastModified,
        lastChanged: remoteLastChanged,
        created: remoteCreated,
        lastAccessed: remoteLastAccessed
      };
    }

    return data;
  }

  describe('CreateInstanceTest', function () {

    function _createInfoFile(info, cb) {
      if (info) {
        info = JSON.stringify(info);
      }
      c.localRawTree.addFileWithDates('/.aem/test', false, info, 12345, 123456, function () {
        c.addFile(c.localRawTree, '/test', function (file) {
          c.localRawTree.open('/.aem/test', function (err, infoFile) {
            expect(err).toBeFalsy();
            cb(file, infoFile);
          });
        });
      });
    }

    it('testCreateInstance', function (done) {
      _createInfoFile(_getCacheInfo(54321, 54321, true), function (file, infoFile) {
        RQLocalFile.createInstance(file, infoFile, c.localTree, function (err, local) {
          expect(err).toBeFalsy();
          expect(local).toBeTruthy();
          expect(local.isCreatedLocally()).toBeTruthy();
          done();
        });
      });
    });

    it('testCreateInstanceBadInfo', function (done) {
      _createInfoFile('', function (file, infoFile) {
        RQLocalFile.createInstance(file, infoFile, c.localTree, function (err, local) {
          expect(err).toBeFalsy();
          expect(local).toBeTruthy();
          expect(local.isCreatedLocally()).toBeFalsy();
          done();
        });
      });
    });

    it('testCreateInstanceNoInfo', function (done) {
      c.addFile(c.localRawTree, '/test', function (file) {
        RQLocalFile.createInstance(file, null, c.localTree, function (err, local) {
          expect(err).toBeFalsy();
          expect(local).toBeTruthy();
          expect(local.isCreatedLocally()).toBeFalsy();
          done();
        });
      });
    });
  });

  it('testAccessors', function (done) {
    c.addFile(c.remoteTree, '/test', function (remote) {
      c.addFile(c.localRawTree, '/test', function (source) {
        var file = new RQLocalFile(source, RQLocalFile.getCacheInfo(source, remote, true), c.localTree);

        expect(file.isCreatedLocally()).toBeTruthy();
        expect(file.getDownloadedRemoteModifiedDate()).toEqual(remote.lastModified());
        expect(file.getLastSyncDate()).toBeTruthy();
        expect(file.isFile()).toEqual(source.isFile());
        expect(file.isDirectory()).toEqual(source.isDirectory());
        expect(file.isReadOnly()).toEqual(source.isReadOnly());
        expect(file.size()).toEqual(source.size());
        expect(file.allocationSize()).toEqual(source.allocationSize());

        file = new RQLocalFile(file, null, c.localTree);

        expect(file.isCreatedLocally()).toBeFalsy();
        expect(file.getDownloadedRemoteModifiedDate()).toEqual(0);
        expect(file.getLastSyncDate()).toEqual(0);

        done();
      });
    });
  });

  describe('CanDeleteTest', function () {
    it('testCanDelete', function (done) {
      c.addFile(c.localRawTree, '/test', function (file) {
        var file = new RQLocalFile(file, _getCacheInfo(file.lastModified(), 1234, false), c.localTree);

        file.canDelete(function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeTruthy();
          done();
        });
      });
    });

    it('testCanDeleteModified', function (done) {
      c.addFile(c.localRawTree, '/test', function (file) {
        var file = new RQLocalFile(file, _getCacheInfo(12345, 1234, false), c.localTree);

        file.canDelete(function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeFalsy();
          done();
        });
      });
    });

    it('testCanDeleteCreated', function (done) {
      c.addFile(c.localRawTree, '/test', function (file) {
        var file = new RQLocalFile(file, _getCacheInfo(file.lastModified(), 1234, true), c.localTree);

        file.canDelete(function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeFalsy();
          done();
        });
      });
    });

    it('testCanDeleteDirectory', function (done) {
      c.addDirectory(c.localRawTree, '/test', function (dir) {
        var file = new RQLocalFile(dir, null, c.localTree);

        file.canDelete(function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeTruthy();
          done();
        });
      });
    });

    it('testCanDeleteTempFile', function (done) {
      c.addFile(c.localRawTree, '/.test', function (file) {
        var file = new RQLocalFile(file, null, c.localTree);

        file.canDelete(function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeTruthy();
          done();
        });
      });
    });

    it('testCanDeleteDangling', function (done) {
      c.addFile(c.localRawTree, '/test', function (file) {
        var file = new RQLocalFile(file, _getCacheInfo(file.lastModified(), 0, false), c.localTree);

        file.canDelete(function (err, canDelete) {
          expect(err).toBeFalsy();
          expect(canDelete).toBeFalsy();
          done();
        });
      });
    });
  });

  describe('TimeTests', function () {
    it('testDatesRemote', function (done) {
      c.addFile(c.localRawTree, '/test', function (local) {
        var file = new RQLocalFile(local, _getCacheInfoExt(
          local.lastModified(), local.lastChanged(), local.created(), local.lastAccessed(),
          12345, 12346, 12347, 12348,
          false
        ), c.localTree);
        expect(file.lastModified()).toEqual(12345);
        expect(file.lastChanged()).toEqual(12346);
        expect(file.created()).toEqual(12347);
        expect(file.lastAccessed()).toEqual(12348);
        file.setLastModified(54321);
        expect(file.lastModified()).toEqual(54321);
        expect(file.lastChanged()).toEqual(54321);
        expect(file.created()).toEqual(12347);
        expect(file.lastAccessed()).toEqual(54321);
        done();
      });
    });

    it('testDatesCreated', function (done) {
      c.addFile(c.localRawTree, '/test', function (local) {
        var file = new RQLocalFile(local, _getCacheInfoExt(
          local.lastModified(), local.lastChanged(), local.created(), local.lastAccessed(),
          0, 0, 0, 0,
          true
        ), c.localTree);
        expect(file.lastModified()).toEqual(local.lastModified());
        expect(file.lastChanged()).toEqual(local.lastChanged());
        expect(file.created()).toEqual(local.created());
        expect(file.lastAccessed()).toEqual(local.lastAccessed());
        file.setLastModified(54321);
        expect(file.lastModified()).toEqual(54321);
        expect(file.lastChanged()).toEqual(54321);
        expect(file.created()).toEqual(local.created());
        expect(file.lastAccessed()).toEqual(54321);
        done();
      });
    });

    it('testDatesDangling', function (done) {
      c.addFile(c.localRawTree, '/test', function (local) {
        var file = new RQLocalFile(local, _getCacheInfoExt(
          local.lastModified(), local.lastChanged(), local.created(), local.lastAccessed(),
          0, 0, 0, 0,
          false
        ), c.localTree);
        expect(file.lastModified()).toEqual(local.lastModified());
        expect(file.lastChanged()).toEqual(local.lastChanged());
        expect(file.created()).toEqual(local.created());
        expect(file.lastAccessed()).toEqual(local.lastAccessed());
        file.setLastModified(54321);
        expect(file.lastModified()).toEqual(54321);
        expect(file.lastChanged()).toEqual(54321);
        expect(file.created()).toEqual(local.created());
        expect(file.lastAccessed()).toEqual(54321);
        done();
      });
    });
  });

  it('testReadWrite', function (done) {
    c.addFile(c.localRawTree, '/test', function (local) {
      var file = new RQLocalFile(local, _getCacheInfo(local.lastModified(), 12345, false), c.localTree);
      file.setLength(5, function (err) {
        expect(err).toBeFalsy();
        file.write('hello', 0, function (err) {
          expect(err).toBeFalsy();
          var buff = new Array(5);
          file.read(buff, 0, 5, 0, function (err, read, buffer) {
            expect(err).toBeFalsy();
            expect(read).toEqual(5);
            expect(buffer.join('')).toEqual('hello');
            expect(buff.join('')).toEqual('hello');
            done();
          });
        });
      });
    });
  });

  it('testDelete', function (done) {
    c.localTree.createFile('/test', function (err, local) {
      expect(err).toBeFalsy();
      local.delete(function (err) {
        expect(err).toBeFalsy();
        c.expectLocalFileExist('/test', false, false, done);
      });
    });
  });

  it('testDeleteDir', function (done) {
    c.localTree.createDirectory('/test', function (err, dir) {
      expect(err).toBeFalsy();
      dir.delete(function (err) {
        expect(err).toBeFalsy();
        c.expectLocalFileExist('/test', false, false, done);
      });
    });
  });

  it('testFlushClose', function (done) {
    c.localTree.createFile('/test', function (err, local) {
      expect(err).toBeFalsy();
      local.flush(function (err) {
        expect(err).toBeFalsy();
        local.close(function (err) {
          expect(err).toBeFalsy();
          done();
        });
      });
    });
  });
});
