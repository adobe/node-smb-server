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
var fs = require('fs');
var Path = require('path');

var logger = require('winston').loggers.get('spi');
var perflog = require('winston').loggers.get('perf');

var File = require('../../spi/file');
var SMBError = require('../../smberror');

/**
 * Creates an instance of File.
 *
 * @constructor
 * @private
 * @this {FSFile}
 * @param {String} filePath normalized file path
 * @param {fs.Stats} stats fs.Stats object
 * @param {FSTree} tree tree object
 */
var FSFile = function (filePath, stats, tree) {
  logger.debug('[fs] file.open %s', filePath);
  if (!(this instanceof FSFile)) {
    return new FSFile(filePath, stats, tree);
  }
  this.stats = stats;
  this.realPath = Path.join(tree.share.path, filePath);
  // extract file permissions from stats.mode, convert to octagonal, check if owner write permission bit is set (00200)
  // see http://stackoverflow.com/questions/11775884/nodejs-file-permissions
  this.writeable = !!(2 & parseInt((stats.mode & parseInt('777', 8)).toString(8)[0]));

  File.call(this, filePath, tree);
};

// the FSFile prototype inherits from File
util.inherits(FSFile, File);

/**
 * Async factory method
 *
 * @param {String} filePath normalized file path
 * @param {FSTree} tree tree object
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {FSFile} cb.file FSFile instance
 */
FSFile.createInstance = function (filePath, tree, cb) {
  var realPath = Path.join(tree.share.path, filePath);
  fs.stat(realPath, function (err, stats) {
    if (err) {
      cb(SMBError.fromSystemError(err));
    } else {
      cb(null, new FSFile(filePath, stats, tree));
    }
  });
};

/**
 * Retrieves the status for the file, refreshing from disk if needed.
 * @returns {fs.Stats} Stats for the File.
 */
FSFile.prototype.getStats = function () {
  var self = this;
  if (self.statsDirty) {
    self.statsDirty = false;
    perflog.debug('%s File.getStats.fs.statSync', self.getPath());
    self.stats = fs.statSync(self.realPath);
  }
  return self.stats;
};

/**
 * Sets the read-only value of the file if needed.
 * @param {Boolean} readOnly If TRUE, file will be read only.
 */
FSFile.prototype.setReadOnly = function (readOnly) {
  var self = this;
  if (self.isReadOnly() && !readOnly) {
    logger.debug('[fs] setReadOnly %s', readOnly);
    fs.chmodSync(self.realPath, '644');
    self.writeable = true;
  } else if (!self.isReadOnly() && readOnly) {
    logger.debug('[fs] setReadOnly %s', readOnly);
    fs.chmodSync(self.realPath, '444');
    self.writeable = false;
  }
};

//---------------------------------------------------------------------< File >

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
FSFile.prototype.isFile = function () {
  return this.getStats().isFile();
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
FSFile.prototype.isDirectory = function () {
  return this.getStats().isDirectory();
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
FSFile.prototype.isReadOnly = function () {
  return !this.writeable;
};

/**
 * Return the file size.
 *
 * @return {Number} file size, in bytes
 */
FSFile.prototype.size = function () {
  return this.getStats().size;
};

/**
 * Return the number of bytes that are allocated to the file.
 *
 * @return {Number} allocation size, in bytes
 */
FSFile.prototype.allocationSize = function () {
  return this.getStats().blocks * this.getStats().blksize;
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last modification
 */
FSFile.prototype.lastModified = function () {
  return this.getStats().mtime.getTime();
};

/**
 * Sets the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @param {Number} ms
 * @return {Number} time of last modification
 */
FSFile.prototype.setLastModified = function (ms) {
  // cheatin' ...
  this.getStats().mtime = new Date(ms);
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
FSFile.prototype.lastChanged = function () {
  return this.getStats().ctime.getTime();
};

/**
 * Return the create time, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
FSFile.prototype.created = function () {
  if (this.getStats().birthtime) {
    // node >= v0.12
    return this.getStats().birthtime.getTime();
  } else {
    return this.getStats().ctime.getTime();
  }
};

/**
 * Return the time of last access, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
FSFile.prototype.lastAccessed = function () {
  return this.getStats().atime.getTime();
};

FSFile.prototype.getDescriptor = function (write, cb) {
  var self = this;
  var callback = SMBError.systemToSMBErrorTranslator(cb);

  var openFd = function () {
    perflog.debug('%s File.getDescriptor.fs.open', self.getPath());
    fs.open(self.realPath, write ? 'r+' : 'r', function (err, fd) {
      if (err) {
        callback(err);
      } else {
        self.fd = fd;
        self.isWrite = write;
        callback(null, self.fd);
      }
    });
  };

  if (!self.fd) {
    openFd();
  } else {
    if (!self.isWrite && write) {
      perflog.debug('%s File.getDescriptor.fs.close', self.getPath());
      // existing FD is for reading, open for writing
      fs.close(self.fd, function (err) {
        if (err) {
          callback(err);
        } else {
          openFd();
        }
      });
    } else {
      // use existing write FD
      callback(null, self.fd);
    }
  }
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
FSFile.prototype.read = function (buffer, offset, length, position, cb) {
  logger.debug('[fs] file.read %s offset=%d, length=%d, position=%d', this.filePath, offset, length, position);
  var callback = SMBError.systemToSMBErrorTranslator(cb);
  var self = this;
  this.getDescriptor(false, function (err, fd) {
    if (err) {
      callback(err);
      return;
    }
    perflog.debug('%s File.read.fs.read %d', self.filePath, length);
    fs.read(fd, buffer, offset, length, position, function (err, bytesRead, buffer) {
      callback(err, bytesRead, buffer);
    });
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
FSFile.prototype.write = function (data, position, cb) {
  logger.debug('[fs] file.write %s data.length=%d, position=%d', this.filePath, data.length, position);
  var callback = SMBError.systemToSMBErrorTranslator(cb);
  var self = this;
  self.getDescriptor(true, function (err, fd) {
    if (err) {
      callback(err);
      return;
    }
    perflog.debug('%s File.write.fs.write %d', self.getPath(), data.length);
    fs.write(fd, data, 0, data.length, position, function (err, bytesWritten, buffer) {
      callback(err);
    });
  });
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSFile.prototype.setLength = function (length, cb) {
  logger.debug('[fs] file.setLength %s length=%d', this.filePath, length);
  var callback = SMBError.systemToSMBErrorTranslator(cb);
  var self = this;
  // make sure the file is closed
  self.close(function (err) {
    if (err) {
      cb(err);
    } else {
      perflog.debug('%s File.setLength.fs.truncate %d', self.getPath(), length);
      fs.truncate(self.realPath, length, function (err) {
        if (err) {
          callback(err);
          return;
        }
        self.statsDirty = true;
        callback();
      });
    }
  });
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSFile.prototype.delete = function (cb) {
  logger.debug('[fs] file.delete %s', this.filePath);
  var self = this;
  // first close the file if needed
  self.close(function (err) {
    if (err) {
      cb(err);
    } else {
      if (self.isDirectory()) {
        perflog.debug('%s File.delete.fs.rmdir', self.getPath());
        fs.rmdir(self.realPath, SMBError.systemToSMBErrorTranslator(cb));
      } else {
        perflog.debug('%s File.delete.fs.unlink', self.getPath());
        fs.unlink(self.realPath, SMBError.systemToSMBErrorTranslator(cb));
      }
    }
  });
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSFile.prototype.flush = function (cb) {
  logger.debug('[fs] file.flush %s', this.filePath);
  // there's nothing to do here
  process.nextTick(function () { cb(); });
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
FSFile.prototype.close = function (cb) {
  logger.debug('[fs] file.close %s', this.filePath);
  var callback = SMBError.systemToSMBErrorTranslator(cb);

  var self = this;
  // close file descriptor if needed
  if (self.fd) {
    perflog.debug('%s File.close.fs.close', self.getPath());
    fs.close(self.fd, function (err) {
      self.fd = undefined;
      callback(err);
    });
  } else {
    // nothing to do
    callback();
  }
};

module.exports = FSFile;


