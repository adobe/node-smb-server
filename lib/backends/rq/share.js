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

'use strict';

var util = require('util');

var logger = require('winston').loggers.get('spi');
var rqlog = require('winston').loggers.get('rq');

var Share = require('../../spi/share');
var RQTree = require('./tree');
var RQRemoteShare = require('./remoteshare');

/**
 * Creates an instance of RQShare.
 *
 * @constructor
 * @this {RQShare}
 * @param {String} name share name
 * @param {Object} config configuration hash
 */
var RQShare = function (name, config) {
  if (!(this instanceof RQShare)) {
    return new RQShare(name, config);
  }
  var self = this;
  this.config = config || {};
  this.listCache = {};
  this.contentCacheTTL = typeof config.contentCacheTTL === 'number' ? config.contentCacheTTL : 30000; // default: 30s

  this.remote = new RQRemoteShare(name, config);
  this.waits = {};
  this.downloadingFiles = {};
  this.remote.on('folderlist', function (files) {
    self.emit('folderlist', files);
  });

  Share.call(this, name, config);
};

// the RQShare prototype inherits from Share
util.inherits(RQShare, Share);

RQShare.prototype.notifyDownloadComplete = function (tree, path) {
  var self = this;
  if (self.waits[path]) {
    var i;
    for (i = 0; i < self.waits[path].length; i++) {
      // invoke waiting callback
      var waitCallback = self.waits[path][i].callback;
      var waitTree = self.waits[path][i].tree;

      logger.info('%s download complete, notifying waiting threads', path);
      waitCallback();
    }
    self.waits[path] = [];
  }
};

RQShare.prototype.waitOnDownload = function (tree, path, cb) {
  var self = this;
  if (self.isDownloading(tree, path)) {
    logger.debug('%s is downloading, waiting for completion', path);
    // wait for download
    if (!self.waits[path]) {
      self.waits[path] = [];
    }
    logger.info('waiting on file %s to download', path);
    self.waits[path].push({ tree: tree, callback: cb });
  } else {
    // not downloading, return immediately
    cb();
  }
};

RQShare.prototype.isDownloading = function (tree, path) {
  if (!tree.isTempFileName(path)) {
    return this.downloadingFiles[path] ? true : false;
  } else {
    // temp files are never downloading
    return false;
  }
};

RQShare.prototype.setDownloading = function (tree, path, isDownloading) {
  var wasDownloading = this.isDownloading(tree, path);
  this.downloadingFiles[path] = isDownloading;
  if (wasDownloading && !isDownloading) {
    // the file is no longer downloading. remove lock
    this.notifyDownloadComplete(tree, path);
  }
};

RQShare.prototype.invalidateContentCache = function (path, deep) {
  rqlog.debug('RQShare.invalidateContentCache %s', path);
  if (this.remote.invalidateContentCache) {
    this.remote.invalidateContentCache(path, deep);
  }
  this.listCache[path] = undefined;
};

RQShare.prototype.getListCache = function (path, tree, cb) {
  if (this.listCache[path]) {
    var now = new Date().getTime();

    if (now - this.listCache[path].timestamp > this.contentCacheTTL) {
      // cache is expired
      rqlog.debug('RQShare.getListCache cache expired %s', path);
      this.listCache[path] = undefined;
      cb();
    } else {
      // cache is valid
      var cache = this.listCache[path].files;
      var addFile = function (index, files) {
        if (index < cache.length) {
          tree.open(cache[index], function (err, rqFile) {
            if (err) {
              cb(err);
            } else {
              files.push(rqFile);
              addFile(index + 1, files);
            }
          });
        } else {
          cb(null, files);
        }
      };
      addFile(0, []);
    }
  } else {
    cb();
  }
};

RQShare.prototype.cacheList = function (path, files) {
  var names = [];
  for (var i = 0; i < files.length; i++) {
    names.push(files[i].getPath());
  }
  this.listCache[path] = {timestamp: new Date().getTime(), files: names};
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

RQShare.prototype.createTree = function (remoteTree, config) {
  return new RQTree(this, remoteTree, config);
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
      cb(null, self.createTree(remoteTree, self.config));
    }
  });
};

module.exports = RQShare;
