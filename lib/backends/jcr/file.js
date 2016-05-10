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

  // object holding path/fd of local copy of remote resource
  this.localFile = null;

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
 * Returns path and fd of local file holding a copy of the remote resource's content.
 *
 * @param {Function} cb callback called with the path of the local file holding a copy of the remote resource's content.
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Object} cb.localFile object holding path/fd of local copy of remote resource
 * @param {String} cb.localFile.path path of local file holding a copy of the remote resource's content.
 * @param {Number} cb.localFile.fd file handle to opened local file
 */
JCRFile.prototype.ensureGotLocalCopy = function (cb) {
  if (this.localFile) {
    cb(null, this.localFile);
    return;
  }

  var self = this;
  this.tree.share.getLocalFile(this.filePath, this.lastModified(), function (err, localFilePath) {
    if (err) {
      cb(err);
    } else {
      fs.open(localFilePath, 'r+', function (err, fd) {
        if (err) {
          logger.error('failed to open local file %s (%s)', localFilePath, self.filePath, err);
          cb(err);
        } else {
          self.localFile = {
            path: localFilePath,
            fd: fd
          };
          cb(null, self.localFile);
        }
      });
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
  if (!this.localFile || !this.dirty) {
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
  this.ensureGotLocalCopy(function (err, localFile) {
    if (err) {
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message));
      return;
    }
    fs.createReadStream(null, { fd: localFile.fd, autoClose: false }).pipe(
      request(options, function (err, resp, body) {
        if (err) {
          logger.error('failed to spool %s to %s', self.localFile.path, self.filePath, err);
          cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message));
        } else if (resp.statusCode !== 200 && resp.statusCode !== 204) {
          logger.error('failed to spool %s to %s - %s %s [%d]', localFile.path, self.filePath, this.method, this.href, resp.statusCode, body);
          cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
        } else {
          // succeeded
          fs.fstat(localFile.fd, function (err, stats) {
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
  });
};

/**
 * Updates the content representation of the fileLength and lastModified attributes.
 *
 * @param {Object} content content object to patch
 * @param {Number} fileLength
 * @param {Number} lastModified (ms)
 */
JCRFile.prototype.patchContent = function (content, fileLength, lastModified) {
  // update fileLength content representation
  this.content[JCR.JCR_CONTENT][JCR.JCR_DATA_LENGTH] = fileLength;
  // update lastModified content representation
  this.content[JCR.JCR_CONTENT][JCR.JCR_LASTMODIFIED] = new Date(lastModified).toISOString();
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
  function getLocalFile(callback) {
    self.ensureGotLocalCopy(callback);
  }

  function read(localFile, callback) {
    fs.read(localFile.fd, buffer, offset, length, position, callback);
  }

  async.waterfall([ getLocalFile, read ], function (err, bytesRead, buffer) {
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
  function getLocalFile(callback) {
    self.ensureGotLocalCopy(callback);
  }

  function write(localFile, callback) {
    fs.write(localFile.fd, data, 0, data.length, position, function (err) {
      callback(err, localFile);
    });
  }

  function updateStats(localFile, callback) {
    fs.fstat(localFile.fd, function (err, stats) {
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

  async.waterfall([ getLocalFile, write, updateStats ], function (err) {
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
  this.ensureGotLocalCopy(function (err, localFile) {
    if (err) {
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message));
      return;
    }
    fs.ftruncate(localFile.fd, length, function (err) {
      if (err) {
        cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, typeof err === 'string' ? err : err.message));
      } else {
        // update length and lastModified
        self.fileLength = length;
        var lastModified = Date.now();
        self.setLastModified(lastModified);
        self.dirty = true;
        // InDesign repeatedly sets (via TRANS2_SET_FILE_INFORMATION) & checks (via TRANS2_FIND_FIRST2) file length during saving.
        // since the file is just truncated locally (i.e. not yet flushed/closed) and the length is returned through a backend request
        // conflicting (i.e non-expected) length values lead to InDesign crashing.
        // a conservative solution would be syncing (i.e. uploading) the file on setLength but is very inefficient, especially for large files.
        // @FIXME workaround to avoid InDesign file corruption: refresh and patch content cache entry with new length
        self.tree.share.getContent(self.filePath, false, function (err, content) {
          if (content) {
            self.patchContent(content, length, lastModified);
            content.fetched = Date.now(); // touch cache entry
          }
          cb(err);
        });
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
      self.dirty = false;
      if (self.localFile) {
        fs.close(self.localFile.fd, function (ignored) {
          self.localFile = null;
          self.tree.share.discardLocalFile(self.filePath, function (ignored) {
            cb();
          });
        });
      } else {
        self.tree.share.discardLocalFile(self.filePath, function (ignored) {
          cb();
        });
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
JCRFile.prototype.flush = function (cb) {
  logger.debug('[%s] file.flush %s', this.tree.share.config.backend, this.filePath);

  if (!this.localFile) {
    // we're done
    cb();
    return;
  }

  fs.fsync(this.localFile.fd, function (err) {
    if (err) {
      logger.warn('failed to flush local file %s (%s)', self.localFile.path, self.filePath, err);
    }
    cb();
  });
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.close = function (cb) {
  logger.debug('[%s] file.close %s', this.tree.share.config.backend, this.filePath);

  if (!this.localFile) {
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
    fs.close(self.localFile.fd, function (err) {
      if (err) {
        logger.warn('failed to close local file %s (%s)', self.localFile.path, self.filePath, err);
      }
      self.localFile = null;
      callback();
    });
  }

  async.series([ sync, cleanup ], cb);
};

module.exports = JCRFile;
