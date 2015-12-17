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

var _ = require('lodash');
var logger = require('winston').loggers.get('spi');

var Tree = require('../../spi/tree');
var consts = require('../../constants');
var SMBError = require('../../smberror');
var IPC = require('./constants');
var IPCFile = require('./file');

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {IPCTree}
 * @param {IPCShare} share parent share
 */
var IPCTree = function (share) {
  if (!(this instanceof IPCTree)) {
    return new IPCTree(share);
  }

  this.share = share;

  this.pipes = {};
  this.pipes[IPC.LSARPC] = {};
  this.pipes[IPC.SRVSVC] = {};

  Tree.call(this);
};

// the IPCTree prototype inherits from Tree
util.inherits(IPCTree, Tree);

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
IPCTree.prototype.exists = function (name, cb) {
  logger.debug('[ipc] tree.exists %s', name);
  var self = this;
  process.nextTick(function () { cb(null, self.pipes[name]); });
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
IPCTree.prototype.open = function (name, cb) {
  logger.debug('[ipc] tree.open %s', name);
  if (this.pipes[name]) {
    process.nextTick(function () { cb(null, new IPCFile(name, this)); });
  } else {
    process.nextTick(function () { cb(new SMBError(consts.STATUS_SMB_NO_SUPPORT)); });
  }
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
IPCTree.prototype.list = function (pattern, cb) {
  logger.debug('[ipc] tree.list %s', pattern);
  var self = this;
  var files = _.keys(this.pipes).map(function (nm) {
    return new IPCFile(nm, self);
  });
  process.nextTick(function () { cb(null, files); });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
IPCTree.prototype.createFile = function (name, cb) {
  logger.debug('[ipc] tree.createFile %s', name);
  process.nextTick(function () { cb(new SMBError(consts.STATUS_SMB_NO_SUPPORT)); });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created directory
 */
IPCTree.prototype.createDirectory = function (name, cb) {
  logger.debug('[ipc] tree.createDirectory %s', name);
  process.nextTick(function () { cb(new SMBError(consts.STATUS_SMB_NO_SUPPORT)); });
};

/**
 * Delete a file or directory. If name denotes a directory, it must be
 * empty in order to be deleted.
 *
 * @param {String} name file or directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
IPCTree.prototype.delete = function (name, cb) {
  logger.debug('[ipc] tree.delete %s', name);
  process.nextTick(function () { cb(new SMBError(consts.STATUS_SMB_NO_SUPPORT)); });
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
IPCTree.prototype.rename = function (oldName, newName, cb) {
  logger.debug('[ipc] tree.rename %s -> %s', oldName, newName);
  process.nextTick(function () { cb(new SMBError(consts.STATUS_SMB_NO_SUPPORT)); });
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
IPCTree.prototype.disconnect = function (cb) {
  logger.debug('[ipc] tree.disconnect');
  process.nextTick(function () { cb(); });
};

module.exports = IPCTree;
