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

var Util = require('util');

var logger = require('winston').loggers.get('spi');

var JCRTree = require('../jcr/tree');
var DAMFile = require('./file');

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {DAMTree}
 * @param {DAMShare} share parent share
 * @param {Object} content JCR node representation
 * @param {Tree} tempFilesTree temporary files tree
 */
var DAMTree = function (share, content, tempFilesTree) {
  if (!(this instanceof DAMTree)) {
    return new DAMTree(share, content, tempFilesTree);
  }

  JCRTree.call(this, share, content, tempFilesTree);
};

// the DAMTree prototype inherits from JCRTree
Util.inherits(DAMTree, JCRTree);

//---------------------------------------------------------------< JCRTree >

/**
 * Async factory method for creating a File instance
 *
 * @param {String} filePath normalized file path
 * @param {Object} [content=null] file meta data (null if unknown)
 * @param {Number} [fileLength=-1] file length (-1 if unknown)
 * @param {Function} cb callback called with the bytes actually read
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file DAMFile instance
 */
DAMTree.prototype.createFileInstance = function (filePath, content, fileLength, cb) {
  content = typeof content === 'object' ? content : null;
  fileLength = typeof fileLength === 'number' ? fileLength : -1;
  cb = arguments[arguments.length - 1];
  if (typeof cb !== 'function') {
    logger.error(new Error('DAMTree.createFileInstance: called without callback'));
    cb = function () {};
  }
  DAMFile.createInstance(filePath, this, content, fileLength, cb);
};

DAMTree.prototype.isTempFileName = function (name) {
  // call base class method
  return JCRTree.prototype.isTempFileName.call(this, name);
};

DAMTree.prototype.fetchFileLength = function (path, cb) {
  // call base class method
  return JCRTree.prototype.fetchFileLength.call(this, path, cb);
};

//---------------------------------------------------------------------< Tree >

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
DAMTree.prototype.exists = function (name, cb) {
  // call base class method
  return JCRTree.prototype.exists.call(this, name, cb);
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
DAMTree.prototype.open = function (name, cb) {
  // call base class method
  return JCRTree.prototype.open.call(this, name, cb);
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
DAMTree.prototype.list = function (pattern, cb) {
  // call base class method
  return JCRTree.prototype.list.call(this, pattern, cb);
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
DAMTree.prototype.createFile = function (name, cb) {
  // call base class method
  return JCRTree.prototype.createFile.call(this, name, cb);
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created directory
 */
DAMTree.prototype.createDirectory = function (name, cb) {
  // call base class method
  return JCRTree.prototype.createDirectory.call(this, name, cb);
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.delete = function (name, cb) {
  // call base class method
  return JCRTree.prototype.delete.call(this, name, cb);
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.deleteDirectory = function (name, cb) {
  // call base class method
  return JCRTree.prototype.deleteDirectory.call(this, name, cb);
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.rename = function (oldName, newName, cb) {
  // call base class method
  return JCRTree.prototype.rename.call(this, oldName, newName, cb);
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.disconnect = function (cb) {
  // call base class method
  return JCRTree.prototype.disconnect.call(this, cb);
};

module.exports = DAMTree;
