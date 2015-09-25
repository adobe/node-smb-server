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

  this.files = {};
}

SMBTree.tidCounter = 0;

/**
 * Normalize a name or pattern. Converts backslashes to slashes, makes sure
 * the path name is absolute, and removes a trailing slash.
 *
 * @param {String} name name to normalize
 * @returns {String} normalized name
 */
function normalize(name) {
  name = name.replace(/\\/g, '/');
  if (!name.length || (name.length && name.charAt(0) != '/')) {
    name = '/' + name;
  }
  if (name.length > 1 && name.substr(-1) === '/') {
    name = name.substr(0, name.length - 1);
  }
}

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
SMBTree.prototype.exists = function (name, cb) {
  this.spiTree.exists(normalize(name), cb);
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
SMBTree.prototype.open = function (name, cb) {
  // todo wrap File object with SMBFile onject?
  this.spiTree.open(normalize(name), cb);
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
SMBTree.prototype.list = function (pattern, cb) {
  // todo wrap File objects with SMBFile objects?
  this.spiTree.list(normalize(pattern), cb);
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
SMBTree.prototype.createFile = function (name, cb) {
  this.spiTree.createFile(normalize(name), cb);
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
SMBTree.prototype.createDirectory = function (name, cb) {
  this.spiTree.createDirectory(normalize(name), cb);
};

/**
 * Delete a file or directory. If name denotes a directory, it must be
 * empty in order to be deleted.
 *
 * @param {String} name file or directory name
 * @param {Function} cb callback called with the result
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.deleted true if the file/directory could be deleted; false otherwise
 */
SMBTree.prototype.delete = function (name, cb) {
  this.spiTree.delete(normalize(name), cb);
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called with the result
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.renamed true if the file/directory could be renamed; false otherwise
 */
SMBTree.prototype.rename = function (oldName, newName, cb) {
  this.spiTree.rename(normalize(oldName), normalize(newName), cb);
};

/**
 * Flush the contents of all open files.
 *
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
SMBTree.prototype.flush = function (cb) {
  this.spiTree.flush(cb);
};

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

