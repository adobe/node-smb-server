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

var async = require('async');
var common = require('../../test-common');
var RQTree = require('../../../../lib/backends/rq/tree');
var RQShare = require('../../../../lib/backends/rq/share');
var TestTree = require('../test/tree');
var TestShare = require('../test/share');
var util = require('util');
var utils = require('../../../../lib/utils');
var consts = require('../../../../lib/backends/rq/common');

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
  self.tempFilesTree = new TestTree();

  self.config = {
    backend: 'test',
    modifiedThreshold: 100,
    local: {
      path: '/local/path'
    },
    work: {
      path: '/work/path'
    },
    localTree: self.localTree,
    tree: self.remoteTree,
    contentCacheTTL: 200,
    preserveCacheFiles: [
      consts.REQUEST_DB
    ]
  };
  self.remoteShare = new TestShare('test', self.config);
  self.testShare = new RQShare(
    'rq',
    self.config,
    self.remoteShare,
    self.remoteTree);
  self.testTree = new RQTree(
    self.testShare,
    self.remoteTree,
    {
      localTree: self.localTree,
      rqdb: self.db,
      noprocessor: true
    });
  self.localRawTree = self.localTree;
  self.localTree = self.testTree.local;
  spyOn(self.remoteTree, 'exists').andCallThrough();
  spyOn(self.remoteTree, 'open').andCallThrough();
  spyOn(self.remoteTree, 'delete').andCallThrough();
  spyOn(self.remoteTree, 'deleteDirectory').andCallThrough();
  spyOn(self.localTree, 'exists').andCallThrough();
  spyOn(self.testShare, 'emit').andCallThrough();
};

util.inherits(RQCommon, common);

RQCommon.prototype.addDirectory = function (tree, dirName, cb) {
  if (!tree.addDirectory) {
    // for compatibility, force use of raw local tree if RQLocalTree is provided.
    tree = this.localRawTree;
  }
  tree.addDirectory(dirName, false, function (err, file) {
    expect(err).toBeFalsy();
    cb(file);
  });
};

RQCommon.prototype.addFile = function (tree, fileName, cb) {
  if (!tree.addFile) {
    // for compatibility, force use of raw local tree if RQLocalTree is provided.
    tree = this.localRawTree;
  }
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
  var self = this;
  self.localRawTree.addFileWithDates(path, readOnly, content, created, lastModified, function (err) {
    expect(err).toBeFalsy();
    self.localRawTree.open(path, function (err, localFile) {
      expect(err).toBeFalsy();
      self.localTree.createFromSource(localFile, false, false, function (err) {
        expect(err).toBeFalsy();
        cb();
      });
    });
  });
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
    console.log(file.lastModified());
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
