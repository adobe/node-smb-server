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
var async = require('async');
var RQTree = common.require(__dirname, '../../../../lib/backends/rq/tree');
var RQShare = common.require(__dirname, '../../../../lib/backends/rq/share');
var TestTree = common.require(__dirname, '../test/tree');
var TestShare = common.require(__dirname, '../test/share');
var FSTree = common.require(__dirname, '../../../../lib/backends/fs/tree');
var FSShare = common.require(__dirname, '../../../../lib/backends/fs/share');
var util = require('util');
var utils = common.require(__dirname, '../../../../lib/utils');
var consts = common.require(__dirname, '../../../../lib/backends/rq/common');
var Path = require('path');

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

  self.localPrefix = "/local/path";

  var remoteShare = new FSShare('remote', {
    "backend": "remotefs",
    "description": "test remote share",
    "path": "/remote/path"
  });
  var localShare = new FSShare('local', {
    "backend": "localfs",
    "description": "test local share",
    "path": self.localPrefix
  });
  var tempShare = new FSShare('temp', {
    "backend": "tempfs",
    "description": "test temp share",
    "path": "/temp/path"
  });

  var host = 'testlocalhost';
  var port = 4502;
  self.hostPrefix = 'http://' + host + ':' + port;
  self.urlPrefix = self.hostPrefix + '/api/assets';
  self.remoteTree = new TestTree(remoteShare, self.urlPrefix, self.request);
  self.tempFilesTree = new TestTree(tempShare);

  self.config = {
    backend: 'rqtest',
    modifiedThreshold: 100,
    local: {
      backend: 'localfs',
      path: '/local/path'
    },
    work: {
      backend: 'workfs',
      path: '/work/path'
    },
    contentCacheTTL: 200,
    preserveCacheFiles: [
      consts.REQUEST_DB
    ],
    host: host,
    port: port
  };
  self.testShare = new RQShare(
    'rq',
    self.config);
  self.testTree = new RQTree(
    self.testShare,
    self.remoteTree,
    {
      noprocessor: true
    });
  self.localTree = self.testTree.local;
  self.localRawTree = self.testTree.local.source;

  function _pathFromUrl(url) {
    var path = url.substr(self.urlPrefix.length);
    path = decodeURI(path);
    return path;
  }

  self.request.registerCreate(function (url, data, cb) {
    self.remoteTree.createFile(_pathFromUrl(url), function (err, file) {
      expect(err).toBeFalsy();
      file.write(data, 0, function (err) {
        expect(err).toBeFalsy();
        file.close(function (err) {
          expect(err).toBeFalsy();
          console.log(url, data);
          cb();
        });
      });
    });
  });

  self.request.registerUpdate(function (url, data, cb) {
    self.remoteTree.open(_pathFromUrl(url), function (err, file) {
      if (err) {
        console.log('ERROR WHILE UPDATING FROM REQUEST', err);
        cb();
      } else {
        file.setLength(data.length, function (err) {
          expect(err).toBeFalsy();
          file.write(data, 0, function (err) {
            expect(err).toBeFalsy();
            file.close(function (err) {
              expect(err).toBeFalsy();
              cb();
            });
          });
        });
      }
    });
  });

  self.request.registerDelete(function (url, cb) {
    self.remoteTree.delete(_pathFromUrl(url), function (err) {
      if (err) {
        console.log('ERROR WHILE DELETING FROM REQUEST', err);
      }
      cb();
    });
  });

  spyOn(self.remoteTree, 'exists').andCallThrough();
  spyOn(self.remoteTree, 'open').andCallThrough();
  spyOn(self.remoteTree, 'delete').andCallThrough();
  spyOn(self.remoteTree, 'deleteDirectory').andCallThrough();
  spyOn(self.localTree, 'exists').andCallThrough();
  spyOn(self.testShare, 'emit').andCallThrough();
};

util.inherits(RQCommon, common);

RQCommon.require = common.require;

RQCommon.prototype.wasPathRequested = function (path) {
  return this.request.wasUrlRequested(this.urlPrefix + path);
};

RQCommon.prototype.getPathMethodRequestCount = function (path, method) {
  return this.request.getUrlMethodRequestCount(this.urlPrefix + path, method);
};

RQCommon.prototype.registerPathStatusCode = function (path, statusCode) {
  this.request.registerUrlStatusCode(this.urlPrefix + path, statusCode);
};

RQCommon.prototype.getFileContent = function (file, cb) {
  var buffer = new Array(file.size());
  file.read(buffer, 0, file.size(), 0, function (err) {
    expect(err).toBeFalsy();
    cb(buffer.join(''));
  });
};

RQCommon.prototype.addDirectory = function (tree, dirName, cb) {
  if (!(tree instanceof TestTree)) {
    // for compatibility, force use of raw local tree if RQLocalTree is provided.
    tree = this.localRawTree;
  }
  tree.createDirectory(dirName, function (err, file) {
    expect(err).toBeFalsy();
    cb(file);
  });
};

RQCommon.prototype.addFileWithContent = function (tree, fileName, content, cb) {
  var self = this;
  self.addFile(tree, fileName, function (file, tree) {
    file.setLength(fileName.length, function (err) {
      expect(err).toBeFalsy();
      file.write(fileName, 0, function (err) {
        expect(err).toBeFalsy();
        file.close(function (err) {
          expect(err).toBeFalsy();
          tree.open(fileName, function (err, file) {
            expect(err).toBeFalsy();
            cb(file);
          });
        });
      });
    });
  });
};

RQCommon.prototype.addRawLocalFile = function (path, cb) {
  this.fs.createEntity(Path.join(this.localPrefix, path), false, cb);
};

RQCommon.prototype.addFile = function (tree, fileName, cb) {
  if (!(tree instanceof TestTree)) {
    // for compatibility, force use of raw local tree if RQLocalTree is provided.
    tree = this.localRawTree;
  }
  tree.createFile(fileName, function (err, file) {
    expect(err).toBeFalsy();
    cb(file, tree);
  });
};

RQCommon.prototype.addFileWithDates = function (tree, path, content, created, lastModified, cb) {
  var self = this;
  var filePath = Path.join(tree.share.path, path);
  self.fs.createEntityWithDates(filePath, false, content, new Date(created), new Date(lastModified), function (err) {
    expect(err).toBeFalsy();
    tree.open(path, function (err, file) {
      expect(err).toBeFalsy();
      if (tree.registerFileUrl) {
        tree.registerFileUrl(path);
      }
      cb(file);
    });
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
  self.addFile(self.localTree, fileName, function (file) {
    self.localTree.createFromSource(file, file, false, function (err) {
      expect(err).toBeFalsy();
      cb();
    });
  });
};

RQCommon.prototype.addLocalFiles = function (numFiles, cb) {
  var self = this;
  var count = 0;

  async.whilst(function () {
    return count < numFiles;
  }, function (whilstCb) {
    self.addLocalFile('/testfile' + (count + 1), whilstCb);
    count++;
  }, function (err) {
    expect(err).toBeFalsy();
    cb();
  });
};

RQCommon.prototype.addLocalFileWithDates = function (path, readOnly, content, created, lastModified, cb) {
  this.addFileWithDates(this.localRawTree, path, content, created, lastModified, cb);
};

RQCommon.prototype.expectLocalFileExistExt = function (fileName, localExists, workExists, createExists, cb) {
  var self = this;
  self.localTree.exists(fileName, function (err, exists) {
    expect(err).toBeFalsy();
    expect(exists).toEqual(localExists);
    self.localTree.cacheInfoExists(fileName, function (err, exists) {
      expect(err).toBeFalsy();
      expect(exists).toEqual(workExists);
      if (exists) {
        self.localTree.isCreatedLocally(fileName, function (err, exists) {
          expect(err).toBeFalsy();
          expect(exists).toEqual(createExists);
          cb();
        });
      } else {
        expect(false).toEqual(createExists);
        cb();
      }
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

RQCommon.prototype.expectFileModifiedDate = function (path, modifiedTime, toEqual, cb) {
  var self = this;
  self.testTree.open(path, function (err, file) {
    expect(err).toBeFalsy();
    if (toEqual) {
      expect(file.lastModified()).toEqual(toEqual);
    } else {
      expect(file.lastModified()).not.toEqual(toEqual);
    }
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
