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
var fs = require('fs');

var logger = require('winston').loggers.get('spi');

var Share = require('../../spi/share');
var DAMShare = require('../dam/share');
var RQTree = require('./tree')
var Path = require('path');
var mkdirp = require('mkdirp');
var utils = require('../../utils');

/**
 * Creates an instance of FSShare.
 *
 * @constructor
 * @this {RQShare}
 * @param {String} name share name
 * @param {Object} config configuration hash
 * @param [Share] remoteShare Optional share that will be used as the underlying remote share.
 * @param [Tree] remoteTree Optional tree implementation that will be used by the RQ to interact with a remote source.
 * @param [Tree] localTree Optional tree implementation that will be used by the RQ to interact with a local source.
 * @param [Tree] workTree Optional tree implementation that will be used by the RQ as the working source.
 */
var RQShare = function (name, config, remoteShare, remoteTree, localTree, workTree) {
  if (!(this instanceof RQShare)) {
    return new RQShare(name, config);
  }
  this.remoteTree = remoteTree;
  this.localTree = localTree;
  this.workTree = workTree;

  if (!remoteShare) {
    remoteShare = new DAMShare(name, config);
  }
  this.remote = remoteShare;

  Share.call(this, name, config);
};

// the RQShare prototype inherits from DAMShare
util.inherits(RQShare, Share);

RQShare.prototype.createTreeInstance = function (content, tempFilesTree) {
  return new RQTree(this, content, tempFilesTree, this.remoteTree, this.localTree, this.workTree);
};

RQShare.prototype.createResourceStream = function (path) {
  var localPath = Path.join(this.config.local.path, path);
  mkdirp.sync(utils.getParentPath(localPath));
  return fs.createWriteStream(localPath);
};

RQShare.prototype.invalidateContentCache = function (path, deep) {
  if (this.remoteTree.invalidateContentCache) {
    this.remoteTree.invalidateContentCache(path, deep);
  }
};

RQShare.prototype.buildResourceUrl = function (path) {
  return this.remote.buildResourceUrl(path);
};

RQShare.prototype.fetchResource = function (path, cb) {
  this.remote.fetchResource(path, cb);
};

//--------------------------------------------------------------------< Share >

/**
 *
 * @param {Session} session
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Tree} cb.tree connected tree
 */
RQShare.prototype.connect = function (session, shareLevelPassword, cb) {
  this.remote.connect(session, shareLevelPassword, cb);
};

module.exports = RQShare;
