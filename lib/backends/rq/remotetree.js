/*
 *  Copyright 2015 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

'use strict';

var util = require('util');
var DAMTree = require('../dam/tree');

var RQRemoteTree = function (share, content, tempFilesTree) {
  if (!(this instanceof RQRemoteTree)) {
    return new RQRemoteTree(share, content, tempFilesTree);
  }
  // need to pass tempFilesTree instance to base class constructor
  // in order to avoid runtime exception when calling DAMTree.deleteDirectory
  DAMTree.call(this, share, content, tempFilesTree);
};

util.inherits(RQRemoteTree, DAMTree);

/**
 * The RQ tree will do its own temp file handling. Disable remote tree's temp file handling capabilities.
 */
RQRemoteTree.prototype.isTempFileName = function (path) {
  return false;
};

/**
 * Provide an actual implementation of the temp file name functionality.
 */
RQRemoteTree.prototype.isTempFileNameForce = function (path) {
  return DAMTree.prototype.isTempFileName.call(this, path);
};

module.exports = RQRemoteTree;
