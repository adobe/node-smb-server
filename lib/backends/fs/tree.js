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
var async = require('async');
var minimatch = require('minimatch');

var Tree = require('../../spi/tree');
var FSFile = require('./file');

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
  this.sharePath = share.path;

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
  fs.stat(Path.join(this.sharePath, name), function (err, stats) {
    cb(null, !err);
  });
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
  var fullPath = Path.join(this.sharePath, name);
  fs.stat(fullPath, function (err, stats) {
    if (err) {
      cb(err);
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
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
FSTree.prototype.list = function (pattern, cb) {
  var parentPath = this.sharePath;
  var pos = pattern.lastIndexOf('/');
  if (pos !== -1) {
    parentPath = Path.join(parentPath, pattern.substring(0, pos));
    pattern = pattern.substring(pos + 1);
  }

  fs.readdir(parentPath, function (err, files) {
    if (err) {
      cb(err);
      return;
    }
    var matchingNames = files.filter(function (name) {
      return minimatch(name, pattern);
    });

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
      cb
    );
  });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.createFile = function (name, cb) {
  fs.open(Path.join(this.sharePath, name), 'wx', function (err, fd) {
    if (err) {
      cb(err);
    } else {
      fs.close(fd, cb);
    }
  });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
FSTree.prototype.createDirectory = function (name, cb) {
  fs.mkdir(Path.join(this.sharePath, name), cb);
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
  fs.unlink(Path.join(this.sharePath, name), function (err) {
    cb(null, !err);
  });
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
  fs.rename(Path.join(this.sharePath, oldName), Path.join(this.sharePath, newName), function (err) {
    cb(null, !err);
  });
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
  // todo implement
  process.nextTick(function () { cb(new Error('not yet implemented')); });
};

module.exports = FSTree;
