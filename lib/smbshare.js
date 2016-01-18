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

var SMBTree = require('./smbtree');

/**
 * Represents an active share exposed by this SMB server.
 *
 * @param {SMBServer} smbServer
 * @param {Share} spiShare
 * @constructor
 */
function SMBShare(smbServer, spiShare) {
  this.smbServer = smbServer;
  this.spiShare = spiShare;
}

SMBShare.prototype.getName = function () {
  return this.spiShare.name;
};

SMBShare.prototype.getDescription = function () {
  return this.spiShare.description;
};

/**
 * Return a flag indicating whether this is a named pipe share.
 *
 * @return {Boolean} <code>true</code> if this is a named pipe share;
 *         <code>false</code> otherwise, i.e. if it is a disk share.
 */
SMBShare.prototype.isNamedPipe = function () {
  return this.spiShare.isNamedPipe();
};

/**
 *
 * @param {Session} session
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {SMBTree} cb.tree connected tree
 */
SMBShare.prototype.connect = function (session, shareLevelPassword, cb) {
  var self = this;
  this.spiShare.connect(session, shareLevelPassword, function (err, tree) {
    if (err) {
      cb(err);
    } else {
      cb(null, new SMBTree(self.smbServer, self, tree));
    }
  });
};

module.exports = SMBShare;

