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

var consts = require('../constants');

/**
 * Creates an instance of Share.
 *
 * @constructor
 * @this {Share}
 * @param {String} name share name
 * @param {Object} config configuration hash
 */
var Share = function (name, config) {
  if (! (this instanceof Share)) {
    return new Share(name, config);
  }
  config = config || {};
  this.name = name;
  this.type = consts.SHARE_TYPE_DISK;
  this.description = config.description || '';
};

/**
 *
 * @param {Session} session
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {IPCTree} cb.tree connected tree
 */
Share.prototype.connect = function (session, shareLevelPassword, cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
};

module.exports = Share;

