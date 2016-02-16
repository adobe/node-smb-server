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

var util = require('util');
var Path = require('path');
var fs = require('fs');

var logger = require('winston').loggers.get('spi');
var async = require('async');

var Tree = require('../../spi/tree');
var FSFile = require('./file');
var SMBError = require('../../smberror');
var utils = require('../../utils');

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {FSTree}
 * @param {FSShare} share parent share
 */
var FSTree = function (share) {
  if (!(this instanceof FSTree)) {
    return new FSTree(share);
  }

  this.share = share;

  Tree.call(this);
};

// the FSTree prototype inherits from Tree
util.inherits(FSTree, Tree);

//---------------------------------------------------------------------< Tree >

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
FSTree.prototype.exists = function (name, cb) {
  logger.debug('[%s] tree.exists %s', this.share.config.backend, name);
  fs.stat(Path.join(this.share.path, name), function (err, stats) {
    if (err && err.code !== 'ENOENT') {
      cb(SMBError.fromSystemError(err));
    } else {
      cb(null, !err);
    }
  });
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
FSTree.prototype.open = function (name, cb) {
  logger.debug('[%s] tree.open %s', this.share.config.backend, name);
  FSFile.createInstance(name, this, cb);
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
FSTree.prototype.list = function (pattern, cb) {
  logger.debug('[%s] tree.list %s', this.share.config.backend, pattern);
  var parentPath = utils.getParentPath(pattern) || '';
  var realParentPath = Path.join(this.share.path, parentPath);
  pattern = utils.getPathName(pattern);

  var self = this;
  fs.readdir(realParentPath, function (err, files) {
    if (err) {
      cb(SMBError.fromSystemError(err));
      return;
    }
    var matchingNames = pattern === '*' ? files : files.filter(function (fileName) { return fileName === pattern; });

    async.map(matchingNames,
      function (name, callback) {
        FSFile.createInstance(Path.join(parentPath, name), self, callback);
      },
      SMBError.systemToSMBErrorTranslator(cb)
    );
  });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
FSTree.prototype.createFile = function (name, cb) {
  logger.debug('[%s] tree.createFile %s', this.share.config.backend, name);
  var self = this;
  fs.open(Path.join(this.share.path, name), 'wx', function (err, fd) {
    if (err) {
      cb(SMBError.fromSystemError(err));
    } else {
      fs.close(fd, function (err) {
        if (err) {
          cb(SMBError.fromSystemError(err));
        } else {
          FSFile.createInstance(name, self, cb);
        }
      });
    }
  });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created directory
 */
FSTree.prototype.createDirectory = function (name, cb) {
  logger.debug('[%s] tree.createDirectory %s', this.share.config.backend, name);
  var self = this;
  fs.mkdir(Path.join(this.share.path, name), function (err) {
    if (err) {
      cb(SMBError.fromSystemError(err));
    } else {
      FSFile.createInstance(name, self, cb);
    }
  });
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.delete = function (name, cb) {
  logger.debug('[%s] tree.delete %s', this.share.config.backend, name);
  fs.unlink(Path.join(this.share.path, name), SMBError.systemToSMBErrorTranslator(cb));
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.deleteDirectory = function (name, cb) {
  logger.debug('[%s] tree.deleteDirectory %s', this.share.config.backend, name);
  fs.rmdir(Path.join(this.share.path, name), SMBError.systemToSMBErrorTranslator(cb));
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.rename = function (oldName, newName, cb) {
  logger.debug('[%s] tree.rename %s to %s', this.share.config.backend, oldName, newName);
  fs.rename(Path.join(this.share.path, oldName), Path.join(this.share.path, newName), SMBError.systemToSMBErrorTranslator(cb));
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.disconnect = function (cb) {
  logger.debug('[%s] tree.disconnect', this.share.config.backend);
  // there's nothing to do here
  process.nextTick(function () { cb(); });
};

module.exports = FSTree;
