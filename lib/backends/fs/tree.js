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
var Path = require('path');
var fs = require('fs');

var logger = require('winston').loggers.get('spi');
var async = require('async');

var Tree = require('../../spi/tree');
var FSFile = require('./file');
var SMBError = require('../../smberror');
var consts = require('../../constants');
var utils = require('../../utils');

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {FSTree}
 * @param {FSShare} share parent share
 */
var FSTree = function (share) {
  if (! (this instanceof FSTree)) {
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
  logger.debug('[%s] exists %s', this.share.config.backend, name);
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
  logger.debug('[%s] open %s', this.share.config.backend, name);
  var callback = SMBError.systemToSMBErrorTranslator(cb);
  var fullPath = Path.join(this.share.path, name);
  fs.stat(fullPath, function (err, stats) {
    if (err) {
      callback(err);
    } else {
      cb(null, new FSFile(fullPath, stats));
    }
  });
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
  logger.debug('[%s] list %s', this.share.config.backend, pattern);
  var parentPath = Path.join(this.share.path, utils.getParentPath(pattern) || '');
  pattern = utils.getPathName(pattern);

  fs.readdir(parentPath, function (err, files) {
    if (err) {
      cb(SMBError.fromSystemError(err));
      return;
    }
    var matchingNames = pattern === '*' ? files : files.filter(function (fileName) { return fileName === pattern; });

    async.map(matchingNames,
      function (name, callback) {
        var path = Path.join(parentPath, name);
        fs.stat(path, function (err, stats) {
          if (err) {
            callback(err);
          } else {
            callback(null, new FSFile(path, stats));
          }
        });
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
 */
FSTree.prototype.createFile = function (name, cb) {
  logger.debug('[%s] createFile %s', this.share.config.backend, name);
  var callback = SMBError.systemToSMBErrorTranslator(cb);
  fs.open(Path.join(this.share.path, name), 'wx', function (err, fd) {
    if (err) {
      callback(err);
    } else {
      fs.close(fd, callback);
    }
  });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.createDirectory = function (name, cb) {
  logger.debug('[%s] createDirectory %s', this.share.config.backend, name);
  fs.mkdir(Path.join(this.share.path, name), SMBError.systemToSMBErrorTranslator(cb));
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.delete = function (name, cb) {
  logger.debug('[%s] delete %s', this.share.config.backend, name);
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
  logger.debug('[%s] deleteDirectory %s', this.share.config.backend, name);
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
  logger.debug('[%s] rename %s to %s', this.share.config.backend, oldName, newName);
  fs.rename(Path.join(this.share.path, oldName), Path.join(this.share.path, newName), SMBError.systemToSMBErrorTranslator(cb));
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.disconnect = function (cb) {
  logger.debug('[%s] disconnect', this.share.config.backend);
  // there's nothing to do here
  process.nextTick(function () { cb(); });
};

/**
 * Return the absolute path of a file within a tree.
 *
 * @param {String} name file name
 * @return {String} absolute path
 */
FSTree.prototype.getPath = function (name) {
  return Path.join(this.share.path, name);
};

module.exports = FSTree;
