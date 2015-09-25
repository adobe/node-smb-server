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

var Tree = require('../../spi/tree');

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {FSTree}
 * @param {FSShare} share parent share
 */
var FSTree = function (share) {
  if (! (this instanceof FSTree)) {
    return new FSTree();
  }

  this.share = share;

  Tree.call(this);
};

// the FSTree prototype inherits from Tree
util.inherits(FSTree, Tree);

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
FSTree.prototype.exists = function (name, cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
FSTree.prototype.open = function (name, cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
FSTree.prototype.list = function (pattern, cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.createFile = function (name, cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.createDirectory = function (name, cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
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
FSTree.prototype.delete = function (name, cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
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
FSTree.prototype.rename = function (oldName, newName, cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.disconnect = function (cb) {
  // todo free resources, open files etc.
};

/**
 * Flush the contents of all open files.
 *
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.flush = function (cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
};

module.exports = FSTree;


