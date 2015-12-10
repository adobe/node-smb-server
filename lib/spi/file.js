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

var Path = require('path');

var async = require('async');

var SMBError = require('../smberror');
var consts = require('../constants');
var utils = require('../utils');

/**
 * Creates an instance of File.
 *
 * @constructor
 * @this {File}
 * @param {String} filePath normalized file path
 * @param {Tree} tree tree object
 */
var File = function (filePath, tree) {
  if (!(this instanceof File)) {
    return new File(filePath, tree);
  }
  this.filePath = filePath;
  this.fileName = utils.getPathName(filePath);
  this.tree = tree;
};

/**
 * Return the Tree.
 *
 * @return {String} file path
 */
File.prototype.getTree = function () {
  return this.tree;
};

/**
 * Return the normalized file path.
 *
 * @return {String} file path
 */
File.prototype.getPath = function () {
  return this.filePath;
};

/**
 * Return the file name.
 *
 * @return {String} file name
 */
File.prototype.getName = function () {
  return this.fileName;
};

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
File.prototype.isFile = function () {
  throw new Error('abstract method');
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
File.prototype.isDirectory = function () {
  throw new Error('abstract method');
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
File.prototype.isReadOnly = function () {
  throw new Error('abstract method');
};

/**
 * Return a flag indicating whether this file is hidden.
 *
 * @return {Boolean} <code>true</code> if this file is hidden;
 *         <code>false</code> otherwise
 */
File.prototype.isHidden = function () {
  var name = this.getName();
  return name.length && (name[0] === '.' || name[0] === '~');
};

/**
 * Return the file size.
 *
 * @return {Number} file size, in bytes
 */
File.prototype.size = function () {
  throw new Error('abstract method');
};

/**
 * Return the number of bytes that are allocated to the file.
 *
 * @return {Number} allocation size, in bytes
 */
File.prototype.allocationSize = function () {
  throw new Error('abstract method');
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last modification
 */
File.prototype.lastModified = function () {
  throw new Error('abstract method');
};

/**
 * Sets the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @param {Number} ms
 * @return {Number} time of last modification
 */
File.prototype.setLastModified = function (ms) {
  throw new Error('abstract method');
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
File.prototype.lastChanged = function () {
  throw new Error('abstract method');
};

/**
 * Return the create time, in seconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
File.prototype.created = function () {
  throw new Error('abstract method');
};

/**
 * Return the time of last access, in seconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
File.prototype.lastAccessed = function () {
  throw new Error('abstract method');
};

/**
 * Read bytes at a certain position inside the file.
 *
 * @param {Buffer} buffer the buffer that the data will be written to
 * @param {Number} offset the offset in the buffer to start writing at
 * @param {Number} length the number of bytes to read
 * @param {Number} position offset where to begin reading from in the file
 * @param {Function} cb callback called with the bytes actually read
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Number} cb.bytesRead number of bytes actually read
 * @param {Buffer} cb.buffer buffer holding the bytes actually read
 */
File.prototype.read = function (buffer, offset, length, position, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Write bytes at a certain position inside the file.
 *
 * @param {Buffer} data buffer to write
 * @param {Number} position position inside file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
File.prototype.write = function (data, position, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
File.prototype.setLength = function (length, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
File.prototype.delete = function (cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
File.prototype.flush = function (cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
File.prototype.close = function (cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Recursive copy/move helper function
 *
 * @param {File} srcFile
 * @param {File} destFile
 * @param {Boolean} deleteSrc if true the result is a move (i.e. copy & delete)
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
function copy(srcFile, destFile, deleteSrc, cb) {
  if (srcFile.isFile()) {
    // file: copy single file
    var srcLength = srcFile.size();
    var buf = new Buffer(Math.min(0xffff, srcLength));
    var read = 0;
    async.whilst(
      function () {
        return read < srcLength;
      },
      function (callback) {
        srcFile.read(buf, 0, buf.length, read, function (err, bytesRead, data) {
          if (err || !bytesRead) {
            callback(err);
            return;
          }
          data = bytesRead < data.length ? data.slice(0, bytesRead) : data;
          destFile.write(data, read, function (err) {
            if (!err) {
              read += bytesRead;
            }
            callback(err);
          });
        });
      },
      function (err) {
        if (err) {
          cb(err);
          return;
        }
        // flush & close dest file, close src file
        async.series([
            function (callback) {
              destFile.flush(callback);
            },
            function (callback) {
              destFile.close(callback);
            },
            function (callback) {
              srcFile.close(callback);
            },
            function (callback) {
              if (deleteSrc) {
                srcFile.delete(callback);
              } else {
                // noop
                callback();
              }
            }
          ],
          function (err) {
            cb(err);
          }
        );
      }
    );
  } else {
    // directory: list src files and copy recursively
    var pattern = srcFile.getPath() + '/*';
    srcFile.getTree().list(pattern, function (err, files) {
      if (err) {
        cb(err);
        return;
      }
      async.each(files,
        function (file, callback) {
          // create & open dest file
          var destPath = Path.join(destFile.getPath(), file.getName());
          var destTree = destFile.getTree();
          var createFn = file.isFile() ? destTree.createFile : destTree.createDirectory;
          createFn.call(destTree, destPath, function (err) {
            if (err) {
              callback(err);
            } else {
              destTree.open(destPath, function (err, destFile) {
                if (err) {
                  callback(err);
                } else {
                  // recurse
                  copy(file, destFile, deleteSrc, function (err) {
                    destFile.close(function (ignored) {
                      callback(err);
                    });
                  });

                }
              });
            }
          });
        },
        function (err) {
          if (err) {
            cb(err);
            return;
          }
          if (deleteSrc) {
            srcFile.delete(cb);
          } else {
            cb();
          }
        }
      );
    });
  }
}

/**
 * Copies this file to another tree
 * @param {Tree} destTree destination tree
 * @param {String} destName name of destination file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
File.prototype.copyTo = function (destTree, destName, cb) {
  var self = this;
  var createFn = this.isFile() ? destTree.createFile : destTree.createDirectory;
  createFn.call(destTree, destName, function (err) {
    if (err) {
      cb(err);
    } else {
      destTree.open(destName, function (err, destFile) {
        if (err) {
          cb(err);
        } else {
          copy(self, destFile, false, function (err) {
            destFile.close(function (ignored) {
              cb(err);
            });
          });
        }
      });
    }
  });
};

/**
 * Moves this file to another tree
 * @param {Tree} destTree destination tree
 * @param {String} destName name of destination file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
File.prototype.moveTo = function (destTree, destName, cb) {
  var self = this;
  var createFn = this.isFile() ? destTree.createFile : destTree.createDirectory;
  createFn.call(destTree, destName, function (err) {
    if (err) {
      cb(err);
    } else {
      destTree.open(destName, function (err, destFile) {
        if (err) {
          cb(err);
        } else {
          copy(self, destFile, true, function (err) {
            destFile.close(function (ignored) {
              cb(err);
            });
          });
        }
      });
    }
  });
};

module.exports = File;
