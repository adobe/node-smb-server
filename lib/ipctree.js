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

var Tree = require('./spi/tree');
var consts = require('./constants');

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {IPCTree}
 * @param {IPCShare} share parent share
 */
var IPCTree = function (share) {
  if (! (this instanceof IPCTree)) {
    return new IPCTree(share);
  }

  this.share = share;

  Tree.call(this);
};

// the IPCTree prototype inherits from Tree
util.inherits(IPCTree, Tree);

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
IPCTree.prototype.exists = function (name, cb) {
  process.nextTick(function () { cb(null, false); });
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
IPCTree.prototype.open = function (name, cb) {
  process.nextTick(function () { cb({ message: 'not found', status: consts.STATUS_NO_SUCH_FILE }); });
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
IPCTree.prototype.list = function (pattern, cb) {
  process.nextTick(function () { cb(null, []); });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
IPCTree.prototype.createFile = function (name, cb) {
  process.nextTick(function () { cb({ message: 'create failed', status: consts.STATUS_SMB_NO_SUPPORT }); });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
IPCTree.prototype.createDirectory = function (name, cb) {
  process.nextTick(function () { cb({ message: 'create failed', status: consts.STATUS_SMB_NO_SUPPORT }); });
};

/**
 * Delete a file or directory. If name denotes a directory, it must be
 * empty in order to be deleted.
 *
 * @param {String} name file or directory name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
IPCTree.prototype.delete = function (name, cb) {
  process.nextTick(function () { cb({ message: 'delete failed', status: consts.STATUS_SMB_NO_SUPPORT }); });
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
IPCTree.prototype.rename = function (oldName, newName, cb) {
  process.nextTick(function () { cb({ message: 'rename failed', status: consts.STATUS_SMB_NO_SUPPORT }); });
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
IPCTree.prototype.disconnect = function (cb) {
};

module.exports = IPCTree;
