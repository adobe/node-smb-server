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

var util = require('util');

var FSTree = require('../../../../lib/backends/fs/tree');
var utils = require('../../../../lib/utils');

var TestTree = function (share, urlPrefix, request) {
  if (!(this instanceof TestTree)) {
    return new TestTree(share);
  }

  this.urlPrefix = urlPrefix;
  this.request = request;

  FSTree.call(this, share);
};

util.inherits(TestTree, FSTree);

TestTree.prototype.isTempFileName = function (name) {
    return false;
};

TestTree.prototype.isTempFileNameForce = function (name) {
    name = utils.getPathName(name);
    if (name) {
        if (name.length > 0) {
            return name[0] == '.';
        }
    }
    return false;
};

TestTree.prototype.registerFileUrl = function (path) {
  var self = this;
  if (this.request) {
    var targetUrl = encodeURI(this.urlPrefix + path);
    this.request.registerUrl(targetUrl, function (callback) {
      self.open(path, function (err, file) {
        if (err) {
          callback(err);
        } else if (file.size()) {
          var buffer = new Array(file.size());
          file.read(buffer, 0, file.size(), 0, function (err) {
            if (err) {
              callback(err);
            } else {
              callback(null, buffer.join(''));
            }
          });
        } else {
          callback(null, '');
        }
      });
    });
  }
};

TestTree.prototype.createFile = function (path, cb) {
  var self = this;
  self.registerFileUrl(path);
  FSTree.prototype.createFile.call(this, path, cb);
}

module.exports = TestTree;
