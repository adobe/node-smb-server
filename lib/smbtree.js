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

var logger = require('winston');

var consts = require('./constants');

/**
 * Represents a tree connection established by <code>TREE_CONNECT_ANDX</code>
 *
 * @param {SMBServer} smbServer
 * @param {SMBShare} smbShare
 * @param {FSTree} spiTree
 * @constructor
 */
function SMBTree(smbServer, smbShare, spiTree) {
  this.smbServer = smbServer;
  this.smbShare = smbShare;
  this.spiTree = spiTree;
  this.tid = ++SMBTree.tidCounter;

  switch (smbShare.getType()) {
    case consts.SHARE_TYPE_DISK:
      this.service = consts.SERVICE_DISKSHARE;
      break;
    case consts.SHARE_TYPE_PRINTER:
      this.service = consts.SERVICE_PRINTER;
      break;
    case consts.SHARE_TYPE_COMM:
      this.service = consts.SERVICE_COMM;
      break;
    case consts.SHARE_TYPE_IPC:
      this.service = consts.SERVICE_NAMEDPIPE;
      break;
    default:
      logger.warn('unexpected share type: %d', smbShare.getType());
      this.service = consts.SERVICE_ANY;
  }
}

SMBTree.tidCounter = 0;

// todo add tree methods

/**
 * Disconnect this tree.
 */
SMBTree.prototype.disconnect = function () {
  this.spiTree.disconnect(function (err) {
    if (err) {
      logger.error('tree disconnect failed:', err);
    }
  });
};

module.exports = SMBTree;

