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

var Share = require('../../../../lib/spi/share');
var TestTree = require('./tree');

var TestShare = function (name, config) {
    if (!(this instanceof TestShare)) {
        return new TestShare();
    }

    this.connectedTree = config.tree;
    this.localTree = config.localTree;
    this.fetchCb = function (path, cb) { cb(); };

    Share.call(this, name, config);
};

TestShare.prototype.setFetchCb = function (cb) {
  this.fetchCb = cb;
};

TestShare.prototype.connect = function (session, shareLevelPassword, cb) {
    if (this.connectedTree) {
        cb('test tree is already connected');
    } else {
        this.connectedTree = new TestTree();
        cb(null, this.connectedTree);
    }
};

TestShare.prototype.buildResourceUrl = function (path) {
    return 'http://localhost:4502' + path;
};

TestShare.prototype.fetchResource = function (path, cb) {
  var self = this;

  var fetchFile = function () {
    self.connectedTree.open(path, function (err, file) {
      if (err) {
        cb(err);
      } else {
        var buffer = new Array(file.size());
        file.read(buffer, 0, file.size(), 0, function (err, read, readBuffer) {
          self.localTree.addFile(file.getPath(), file.isReadOnly(), buffer, function (err, localFile) {
            if (err) {
              cb(err);
            } else {
              self.fetchCb(localFile, function () {
                cb(null, path);
              });
            }
          });
        });
      }
    });
  };

  if (!self.localTree) {
    cb('attempting to fetch resource but no local tree is defined');
  } else {
    if (!self.connectedTree) {
      self.connect({}, {}, function (err, tree) {
        fetchFile();
      });
    } else {
      fetchFile();
    }
  }
};

TestShare.prototype.applyRequestDefaults = function (options) {
    return options;
};

module.exports = TestShare;
