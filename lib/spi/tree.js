/*
 *  Copyright 2015 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

'use strict';

var ntstatus = require('../ntstatus');
var SMBError = require('../smberror');

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
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_NOT_IMPLEMENTED)); });
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
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_NOT_IMPLEMENTED)); });
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
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
Tree.prototype.createFile = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created directory
 */
Tree.prototype.createDirectory = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
Tree.prototype.delete = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
Tree.prototype.deleteDirectory = function (name, cb) {
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_NOT_IMPLEMENTED)); });
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
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
Tree.prototype.disconnect = function (cb) {
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_NOT_IMPLEMENTED)); });
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
