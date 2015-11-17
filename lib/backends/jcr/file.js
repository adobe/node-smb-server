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

var Util = require('util');
var fs = require('fs');

var logger = require('winston').loggers.get('spi');
var tmp = require('temp').track();  // cleanup on exit
var async = require('async');
var request = require('request');

var File = require('../../spi/file');
var FSFile = require('../fs/file');
var SMBError = require('../../smberror');
var consts = require('../../constants');
var utils = require('../../utils');
var JCR = require('./constants');

/**
 * Creates an instance of File.
 *
 * @constructor
 * @this {JCRFile}
 * @param {String} filePath normalized file path
 * @param {Object} content JCR file content representation
 * @param {Number} fileLength file length
 * @param {JCRTree} tree tree object
 */
var JCRFile = function (filePath, content, fileLength, tree) {
  logger.debug('[%s] open %s', tree.share.config.backend, filePath);
  if (! (this instanceof JCRFile)) {
    return new JCRFile(filePath, content, fileLength, tree);
  }
  this.content = content;
  this.tree = tree;
  this.fileLength = fileLength;

  // local copy of remote resource
  this.localFilePath = null;

  File.call(this, filePath, tree);
};

// the JCRFile prototype inherits from File
Util.inherits(JCRFile, File);

/**
 * Returns the path of local file holding a copy of the remote resource's content.
 *
 * @param {Function} cb callback called with the path of the local file holding a copy of the remote resource's content.
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {String} cb.localFilePath path of local file holding a copy of the remote resource's content.
 */
JCRFile.prototype.ensureGotLocalCopy = function (cb) {
  if (this.localFilePath) {
    cb(null, this.localFilePath);
    return;
  }

  // spool remote resource to local tmp file
  var stream = tmp.createWriteStream({
    suffix: '-' + this.fileName
  });
  var tmpFilePath = stream.path;

  var self = this;

  var failed = false;
  stream.on('finish', function () {
    if (failed) {
      fs.unlink(tmpFilePath, function (ignore) {
        cb('failed to spool ' + self.filePath + ' to ' + tmpFilePath);
      });
    } else {
      fs.stat(tmpFilePath, function (err, stats) {
        if (err) {
          cb(err);
        } else {
          self.localFilePath = tmpFilePath;
          cb(null, self.localFilePath);
        }
      });
    }
  });

  var url = 'http://' + this.tree.share.host + ':' + this.tree.share.port + this.tree.share.path + this.filePath;
  var options = this.tree.share.applyRequestDefaults(null, url);
  request(options)
    .on('response', function (resp) {
      if (resp.statusCode !== 200) {
        logger.error('failed to spool %s to %s - %s %s [%d]', self.filePath, tmpFilePath, this.method, this.href, resp.statusCode);
        failed = true;
      }
    })
    .on('error', function (err) {
      fs.unlink(tmpFilePath, function (ignore) {
        cb(err);
      });
    })
    .pipe(stream);
};

//---------------------------------------------------------------------< File >

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
JCRFile.prototype.isFile = function () {
  return this.tree.isFilePrimaryType(this.content[JCR.JCR_PRIMARYTYPE]);
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
JCRFile.prototype.isDirectory = function () {
  return this.tree.isDirectoryPrimaryType(this.content[JCR.JCR_PRIMARYTYPE]);
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
JCRFile.prototype.isReadOnly = function () {
  // todo determine readOnly status
  return false;
};

/**
 * Return the file size.
 *
 * @return {Number} file size, in bytes
 */
JCRFile.prototype.size = function () {
  return this.fileLength;
};

/**
 * Return the number of bytes that are allocated to the file.
 *
 * @return {Number} allocation size, in bytes
 */
JCRFile.prototype.allocationSize = function () {
  return this.isFile() ? this.size() : 0;
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last modification
 */
JCRFile.prototype.lastModified = function () {
  return this.isFile() ? new Date(this.content[JCR.JCR_CONTENT][JCR.JCR_LASTMODIFIED]).getTime() : this.created();
};

/**
 * Sets the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @param {Number} ms
 * @return {Number} time of last modification
 */
JCRFile.prototype.setLastModified = function (ms) {
  if (this.isFile()) {
    this.content[JCR.JCR_CONTENT][JCR.JCR_LASTMODIFIED] = new Date(ms).toISOString();
  }
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
JCRFile.prototype.lastChanged = function () {
  // todo correct?
  return this.created();
};

/**
 * Return the create time, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
JCRFile.prototype.created = function () {
  return new Date(this.content[JCR.JCR_CREATED]).getTime();
};

/**
 * Return the time of last access, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
JCRFile.prototype.lastAccessed = function () {
  // todo correct?
  return this.lastModified();
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
JCRFile.prototype.read = function (buffer, offset, length, position, cb) {
  logger.debug('[%s] read %s offset=%d, length=%d, position=%d', this.tree.share.config.backend, this.filePath, offset, length, position);

  var self = this;
  function getLocalFilePath(callback) {
    self.ensureGotLocalCopy(callback);
  }

  function open(localFilePath, callback) {
    fs.open(localFilePath, 'r', callback);
  }

  function read(fd, callback) {
    fs.read(fd, buffer, offset, length, position, function (err, bytesRead, buffer) {
      callback(err, fd, bytesRead, buffer);
    });
  }

  function close(fd, bytesRead, buffer, callback) {
    fs.close(fd, function (err) {
      callback(err, bytesRead, buffer);
    });
  }

  async.waterfall([ getLocalFilePath, open, read, close ], function (err, bytesRead, buffer) {
    if (err) {
      err = new SMBError(consts.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message);
    }
    cb(err, bytesRead, buffer);
  });
};

/**
 * Write bytes at a certain position inside the file.
 *
 * @param {Buffer} data buffer to write
 * @param {Number} position position inside file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.write = function (data, position, cb) {
  logger.debug('[%s] write %s data.length=%d, position=%d', this.tree.share.config.backend, this.filePath, data.length, position);

  var self = this;
  function getLocalFilePath(callback) {
    self.ensureGotLocalCopy(callback);
  }

  function open(localFilePath, callback) {
    fs.open(localFilePath, 'r+', callback);
  }

  function write(fd, callback) {
    fs.write(fd, data, 0, data.length, position, function (err) {
      callback(err, fd);
    });
  }

  function close(fd, callback) {
    fs.close(fd, callback);
  }

  async.waterfall([ getLocalFilePath, open, write, close ], function (err) {
    if (err) {
      err = new SMBError(consts.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message);
    }
    cb(err);
  });
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.setLength = function (length, cb) {
  logger.debug('[%s] setLength %s length=%d', this.tree.share.config.backend, this.filePath, length);
  // todo avoid spooling the entire file if length is 0, just create an empty local tmp file
  var self = this;
  this.ensureGotLocalCopy(function (err, localFilePath) {
    if (err) {
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message));
      return;
    }
    fs.truncate(localFilePath, length, function (err) {
      if (err) {
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message));
      } else {
        self.fileLength = length;
        cb();
      }
    });
  });
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.delete = function (cb) {
  logger.debug('[%s] delete %s', this.tree.share.config.backend, this.filePath);

  // todo use sling/davex api
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.flush = function (cb) {
  logger.debug('[%s] flush %s', this.tree.share.config.backend, this.filePath);
  if (!this.localFilePath) {
    // no changes, we're done
    process.nextTick(function () { cb(); });
    return;
  }

  // todo use sling/davex api
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.close = function (cb) {
  logger.debug('[%s] close %s', this.tree.share.config.backend, this.filePath);
  if (this.localFilePath) {
    // delete local tmp file
    fs.unlink(this.localFilePath, cb);
    this.localFilePath = null;
  } else {
    process.nextTick(function () { cb(); });
  }
};

module.exports = JCRFile;


