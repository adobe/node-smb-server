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
var async = require('async');
var mkdirp = require('mkdirp');

var Share = require('../../spi/share');
var FSTree = require('./tree');
var SMBError = require('../../smberror');
var ntstatus = require('../../ntstatus');

/**
 * Creates an instance of FSShare.
 *
 * @constructor
 * @this {FSShare}
 * @param {String} name share name
 * @param {Object} config configuration hash
 */
var FSShare = function (name, config) {
  if (!(this instanceof FSShare)) {
    return new FSShare(name, config);
  }
  config = config || {};

  Share.call(this, name, config);

  this.path = config.path;
  this.description = config.description || '';
};

// the FSShare prototype inherits from Share
util.inherits(FSShare, Share);

//--------------------------------------------------------------------< Share >

/**
 * Return a flag indicating whether this is a named pipe share.
 *
 * @return {Boolean} <code>true</code> if this is a named pipe share;
 *         <code>false</code> otherwise, i.e. if it is a disk share.
 */
FSShare.prototype.isNamedPipe = function () {
  return false;
};

/**
 *
 * @param {Session} session
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {FSTree} cb.tree connected tree
 */
FSShare.prototype.connect = function (session, shareLevelPassword, cb) {
  // todo check access rights of session?

  var self = this;
  function stat(done) {
    fs.stat(self.path, function (err, stats) {
      done(null, stats);
    });
  }

  function createOrValidate(stats, done) {
    if (!stats) {
      mkdirp(self.path, done);
    } else {
      if (!stats.isDirectory()) {
        done('invalid share configuration: ' + self.path + ' is not a valid directory path');
      } else {
        done();
      }
    }
  }

  async.waterfall([ stat, createOrValidate ], function (err) {
    if (err) {
      logger.error(err);
      var msg = typeof err === 'string' ? err : err.message;
      cb(SMBError.fromSystemError(err, 'unable to connect fs tree due to unexpected error'));
    } else {
      cb(null, new FSTree(self));
    }
  });
};

module.exports = FSShare;

