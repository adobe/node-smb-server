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

var SMBError = require('../smberror');
var consts = require('../constants');

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {Tree}
 */
var Tree = function () {
  if (!(this instanceof Tree)) {
    return new Tree();
  }
};

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
Tree.prototype.exists = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
Tree.prototype.open = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
Tree.prototype.list = function (pattern, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
Tree.prototype.createFile = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
Tree.prototype.createDirectory = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
Tree.prototype.delete = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
Tree.prototype.deleteDirectory = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
Tree.prototype.rename = function (oldName, newName, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
Tree.prototype.disconnect = function (cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Return the absolute path of a file within a tree.
 *
 * @param {String} name file name
 * @return {String} absolute path
 */
Tree.prototype.getPath = function (name) {
  return name;
};

module.exports = Tree;
