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

var Util = require('util');

var JCRShare = require('../jcr/share');
var DAMTree = require('./tree');

/**
 * Creates an instance of JCRShare.
 *
 * @constructor
 * @this {JCRShare}
 * @param {String} name share name
 * @param {Object} config configuration hash
 */
var DAMShare = function (name, config) {
  if (!(this instanceof DAMShare)) {
    return new DAMShare(name, config);
  }
  config = config || {};
  if (!config.path) {
    config.path = '/content/dam';
  }
  JCRShare.call(this, name, config);
};

// the DAMShare prototype inherits from JCRShare
Util.inherits(DAMShare, JCRShare);

//-----------------------------------------------------------------< JCRShare >

DAMShare.prototype.createTreeInstance = function (content, tempFilesTree) {
  return new DAMTree(this, content, tempFilesTree);
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
DAMShare.prototype.connect = function (session, shareLevelPassword, cb) {
  // call base class method
  return JCRShare.prototype.connect.call(this, session, shareLevelPassword, cb);
};

module.exports = DAMShare;

