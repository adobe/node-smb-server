/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2015 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 **************************************************************************/

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
var consts = require('../../constants');

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
  this.type = consts.SHARE_TYPE_DISK;
  this.description = config.description || '';
};

// the FSShare prototype inherits from Share
util.inherits(FSShare, Share);

//--------------------------------------------------------------------< Share >

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
      cb(new SMBError(ntstatus.STATUS_OBJECT_PATH_NOT_FOUND, msg));
    } else {
      cb(null, new FSTree(self));
    }
  });
};

module.exports = FSShare;

