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
var fs = require('fs');

var logger = require('winston').loggers.get('spi');
var async = require('async');
var request = require('request');
var mime = require('mime');

var File = require('../../spi/file');
var ntstatus = require('../../ntstatus');
var SMBError = require('../../smberror');
var JCR = require('./constants');

/**
 * Creates an instance of File.
 *
 * @constructor
 * @private
 * @this {JCRFile}
 * @param {String} filePath normalized file path
 * @param {Object} content JCR file content representation
 * @param {Number} fileLength file length
 * @param {JCRTree} tree tree object
 */
var JCRFile = function (filePath, content, fileLength, tree) {
  logger.debug('[%s] file.open %s', tree.share.config.backend, filePath);
  if (!(this instanceof JCRFile)) {
    return new JCRFile(filePath, content, fileLength, tree);
  }
  this.content = content;
  this.tree = tree;
  this.fileLength = fileLength;

  // local copy of remote resource
  this.localFilePath = null;

  // needs flushing?
  this.dirty = false;

  File.call(this, filePath, tree);
};

// the JCRFile prototype inherits from File
Util.inherits(JCRFile, File);

/**
 * Async factory method
 *
 * @param {String} filePath normalized file path
 * @param {JCRTree} tree tree object
 * @param {Object} [content=null] file meta data (null if unknown)
 * @param {Number} [fileLength=-1] file length (-1 if unknown)
 * @param {Function} cb callback called with the bytes actually read
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {JCRFile} cb.file JCRFile instance
 */
JCRFile.createInstance = function (filePath, tree, content, fileLength, cb) {
  content = typeof content === 'object' ? content : null;
  fileLength = typeof fileLength === 'number' ? fileLength : -1;
  cb = arguments[arguments.length - 1];
  if (typeof cb !== 'function') {
    logger.error(new Error('JCRFile.createInstance: called without callback'));
    cb = function () {};
  }

  function getContent(callback) {
    if (content) {
      callback(null, content);
    } else {
      tree.share.getContent(filePath, false, function (err, content) {
        if (content) {
          callback(err, content);
        } else {
          callback(err || 'not found: ' + filePath);
        }
      });
    }
  }

  function getFileLength(content, callback) {
    if (fileLength > -1) {
      callback(null, content, fileLength);
    } else if (!tree.share.isFilePrimaryType(content[JCR.JCR_PRIMARYTYPE])) {
      // folder has length 0
      callback(null, content, 0);
    } else if (typeof content[JCR.JCR_CONTENT][JCR.JCR_DATA_LENGTH] === 'number') {
      callback(null, content, content[JCR.JCR_CONTENT][JCR.JCR_DATA_LENGTH]);
    } else {
      // last resort: send a separate request for file length
      tree.fetchFileLength(filePath, function (err, length) {
        if (err) {
          callback(err);
        } else {
          callback(null, content, length);
        }
      });
    }
  }

  async.seq(getContent, getFileLength)(function (err, metaData, length) {
    if (err) {
      logger.error('failed to fetch metadata of file %s', filePath, err);
      cb(new SMBError(ntstatus.STATUS_NO_SUCH_FILE));
    } else {
      cb(null, new JCRFile(filePath, metaData, length, tree));
    }
  });
};

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

  var self = this;
  this.tree.share.getLocalFile(this.filePath, this.lastModified(), function (err, localFilePath) {
    if (err) {
      cb(err);
    } else {
      self.localFilePath = localFilePath;
      cb(null, localFilePath);
    }
  });
};

/**
 * Uploads the local tmp file to the server if there are pending changes.
 *
 * @param {Function} cb callback called on completion.
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.syncLocalChanges = function (cb) {
  if (!this.localFilePath || !this.dirty) {
    // no local changes, we're done
    cb();
    return;
  }

  logger.debug('[%s] file.syncLocalChanges %s', this.tree.share.config.backend, this.filePath);

  // deferred write (spool local tmp file to server)
  var self = this;
  var url = this.tree.share.buildResourceUrl(this.filePath);
  var options = this.tree.share.applyRequestDefaults({
    url: url,
    method: 'PUT',
    headers: {
      'Content-Type': mime.lookup(this.filePath)
    }
  });
  fs.createReadStream(this.localFilePath).pipe(
    request(options, function (err, resp, body) {
      if (err) {
        logger.error('failed to spool %s to %s', self.localFilePath, self.filePath, err);
        cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message));
      } else if (resp.statusCode !== 200 && resp.statusCode !== 204) {
        logger.error('failed to spool %s to %s - %s %s [%d]', self.localFilePath, self.filePath, this.method, this.href, resp.statusCode, body);
        cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
      } else {
        // succeeded
        fs.stat(self.localFilePath, function (err, stats) {
          if (err) {
            cb(err);
          } else {
            // invalidate content cache
            self.tree.share.invalidateContentCache(self.filePath, false);
            // update length and lastModified
            self.fileLength = stats.size;
            self.setLastModified(stats.mtime.getTime());
            self.dirty = false;
            // touch cache entry
            self.tree.share.touchLocalFile(self.filePath, self.lastModified(), function (err) {
              cb(err);
            });
          }
        });
      }
    })
  );
};

//---------------------------------------------------------------------< File >

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
JCRFile.prototype.isFile = function () {
  return this.tree.share.isFilePrimaryType(this.content[JCR.JCR_PRIMARYTYPE]);
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
JCRFile.prototype.isDirectory = function () {
  return this.tree.share.isDirectoryPrimaryType(this.content[JCR.JCR_PRIMARYTYPE]);
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
JCRFile.prototype.isReadOnly = function () {
  return this.content[JCR.JCR_ISCHECKEDOUT] === false;
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
  if (this.isFile() && this.content[JCR.JCR_CONTENT][JCR.JCR_LASTMODIFIED]) {
    return new Date(this.content[JCR.JCR_CONTENT][JCR.JCR_LASTMODIFIED]).getTime();
  } else {
    return this.created();
  }
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
    // update lastModified (transient)
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
  logger.debug('[%s] file.read %s offset=%d, length=%d, position=%d', this.tree.share.config.backend, this.filePath, offset, length, position);

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
      err = new SMBError(ntstatus.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message);
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
  logger.debug('[%s] file.write %s data.length=%d, position=%d', this.tree.share.config.backend, this.filePath, data.length, position);

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

  function updateStats(callback) {
    fs.stat(self.localFilePath, function (err, stats) {
      if (err) {
        callback(err);
      } else {
        // update length and lastModified
        self.fileLength = stats.size;
        self.setLastModified(stats.mtime.getTime());
        self.dirty = true;
        // touch cache entry
        self.tree.share.touchLocalFile(self.filePath, self.lastModified(), function (err) {
          callback(err);
        });
      }
    });
  }

  async.waterfall([ getLocalFilePath, open, write, close, updateStats ], function (err) {
    if (err) {
      err = new SMBError(ntstatus.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message);
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
  logger.debug('[%s] file.setLength %s length=%d', this.tree.share.config.backend, this.filePath, length);
  // todo avoid spooling the entire file if length is 0, just create an empty local tmp file
  var self = this;
  this.ensureGotLocalCopy(function (err, localFilePath) {
    if (err) {
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message));
      return;
    }
    fs.truncate(localFilePath, length, function (err) {
      if (err) {
        cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message));
      } else {
        // update length and lastModified
        self.fileLength = length;
        self.setLastModified(new Date().getTime());
        self.dirty = true;
        // auto-flush in order to avoid InDesign file corruption
        self.flush(cb);
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
  logger.debug('[%s] file.delete %s', this.tree.share.config.backend, this.filePath);
  var url = this.tree.share.buildResourceUrl(this.filePath);
  var options = this.tree.share.applyRequestDefaults({
    url: url,
    method: 'DELETE'
  });
  var self = this;
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to delete %s', self.filePath, err);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else if (resp.statusCode !== 204) {
      logger.error('failed to delete %s - %s %s [%d]', self.filePath, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else {
      // succeeded
      // invalidate cache
      self.tree.share.invalidateContentCache(self.filePath, self.isDirectory());
      self.tree.share.discardLocalFile(self.filePath, function (ignored) {});
      self.dirty = false;
      self.localFilePath = null;
      cb();
    }
  });
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.flush = function (cb) {
  logger.debug('[%s] file.flush %s', this.tree.share.config.backend, this.filePath);

  // local changes will be sync'ed on close, there's nothing to do here right now
  process.nextTick(function () { cb(); });
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.close = function (cb) {
  logger.debug('[%s] file.close %s', this.tree.share.config.backend, this.filePath);

  if (!this.localFilePath) {
    // we're done
    cb();
    return;
  }

  var self = this;
  function sync(callback) {
    if (self.dirty) {
      self.syncLocalChanges(callback);
    } else {
      callback();
    }
  }

  function cleanup(callback) {
    self.localFilePath = null;
    callback();
  }

  async.series([ sync, cleanup ], cb);
};

module.exports = JCRFile;
