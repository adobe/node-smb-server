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
var fs =  require('fs');
var logger = require('winston');

var Share = require('../../spi/share');
var FSTree = require('./tree');
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
  if (! (this instanceof FSShare)) {
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

FSShare.prototype.getPath = function () {
  return this.path;
};

/**
 *
 * @param {Session} session
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {FSTree} cb.tree connected tree
 */
FSShare.prototype.connect = function (session, shareLevelPassword, cb) {
  // todo check access rights of session?

  var self = this;
  fs.stat(this.path, function (err, stats) {
    if (err || !stats.isDirectory()) {
      logger.error('invalid share configuration: %s is not a valid directory path', self.path, err);
      cb(err);
    } else {
      cb(null, new FSTree(self));
    }
  });
};

module.exports = FSShare;

