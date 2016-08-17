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
var RQTree = require('./tree')
var RQRemoteShare = require('./remoteshare');

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
  this.config = config || {};
  this.remoteTree = remoteTree;
  this.localTree = localTree;
  this.workTree = workTree;

  if (!remoteShare) {
    remoteShare = new RQRemoteShare(name, config);
  }
  this.remote = remoteShare;

  Share.call(this, name, config);
};

// the RQShare prototype inherits from DAMShare
util.inherits(RQShare, Share);

RQShare.prototype.invalidateContentCache = function (path, deep) {
  if (this.remote.invalidateContentCache) {
    this.remote.invalidateContentCache(path, deep);
  }
};

RQShare.prototype.buildResourceUrl = function (path) {
  return this.remote.buildResourceUrl(path);
};

RQShare.prototype.fetchResource = function (path, cb) {
  this.remote.fetchResource(path, cb);
};

RQShare.prototype.applyRequestDefaults = function(opts, url) {
  return this.remote.applyRequestDefaults(opts, url);
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
  var self = this;
  self.remote.connect(session, shareLevelPassword, function (err, remoteTree) {
    if (err) {
      cb(err);
    } else {
      cb(null, new RQTree(self, remoteTree, self.config));
    }
  });
};

module.exports = RQShare;
