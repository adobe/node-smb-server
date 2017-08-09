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

var JCRFile = require('../jcr/file');
var DAM = require('./constants');
var JCR = require('../jcr/constants');
var SMBError = require('../../smberror');
var ntstatus = require('../../ntstatus');
var utils = require('../../utils');
var webutils = require('../../webutils');

/**
 * Creates an instance of File.
 *
 * @constructor
 * @this {DAMFile}
 * @param {String} filePath normalized file path
 * @param {Object} content JCR file content representation
 * @param {Number} fileLength file length
 * @param {DAMTree} tree tree object
 */
var DAMFile = function (filePath, content, fileLength, tree) {
  if (!(this instanceof DAMFile)) {
    return new DAMFile(filePath, content, fileLength, tree);
  }

  JCRFile.call(this, filePath, content, fileLength, tree);
};

// the DAMFile prototype inherits from JCRFile
Util.inherits(DAMFile, JCRFile);

/**
 * Async factory method
 *
 * @param {String} filePath normalized file path
 * @param {DAMTree} tree tree object
 * @param {Object} [content=null] file meta data (null if unknown)
 * @param {Number} [fileLength=-1] file length (-1 if unknown)
 * @param {Function} cb callback called with the bytes actually read
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {DAMFile} cb.file DAMFile instance
 */
DAMFile.createInstance = function (filePath, tree, content, fileLength, cb) {
  content = typeof content === 'object' ? content : null;
  fileLength = typeof fileLength === 'number' ? fileLength : -1;
  cb = arguments[arguments.length - 1];
  if (typeof cb !== 'function') {
    logger.error(new Error('DAMFile.createInstance: called without callback'));
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
    } else if (tree.share.isFolderClass(content)) {
      // folder has length 0
      callback(null, content, 0);
    } else {
      callback(null, content, content[DAM.PROPERTIES][DAM.ASSET_SIZE] || 0);
    }
  }

  async.seq(getContent, getFileLength)(function (err, metaData, length) {
    if (err) {
      logger.error('unexpected error while retrieving content for file %s', filePath, err);
      cb(new SMBError(ntstatus.STATUS_NO_SUCH_FILE, 'cannot get content for file because it was not found ' + filePath));
    } else {
      cb(null, new DAMFile(filePath, metaData, length, tree));
    }
  });
};

/**
 * Uploads the local tmp file to the server if there are pending changes.
 *
 * @param {Function} cb callback called on completion.
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
DAMFile.prototype.syncLocalChanges = function (cb) {
  // call base class method
  return JCRFile.prototype.syncLocalChanges.call(this, cb);
};

/**
 * Updates the content representation of the fileLength and lastModified attributes.
 *
 * @param {Object} content content object to patch
 * @param {Number} fileLength
 * @param {Number} lastModified (ms)
 */
DAMFile.prototype.patchContent = function (content, fileLength, lastModified) {
  // update fileLength content representation
  this.content[DAM.PROPERTIES][DAM.ASSET_SIZE] = fileLength;
  // update lastModified content representation
  this.content[DAM.PROPERTIES][JCR.JCR_LASTMODIFIED] = new Date(lastModified).toISOString();
};

//------------------------------------------------------------------< JCRFile >

/**
 * Returns path and fd of local file holding a copy of the remote resource's content.
 *
 * @param {Function} cb callback called with the path of the local file holding a copy of the remote resource's content.
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Object} cb.localFile object holding path/fd of local copy of remote resource
 * @param {String} cb.localFile.path path of local file holding a copy of the remote resource's content.
 * @param {Number} cb.localFile.fd file handle to opened local file
 */
DAMFile.prototype.ensureGotLocalCopy = function (cb) {
  // call base class method
  return JCRFile.prototype.ensureGotLocalCopy.call(this, cb);
};

//---------------------------------------------------------------------< File >

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
DAMFile.prototype.isFile = function () {
  return this.tree.share.isAssetClass(this.content);
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
DAMFile.prototype.isDirectory = function () {
  return this.tree.share.isFolderClass(this.content);
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
DAMFile.prototype.isReadOnly = function () {
  return this.content[DAM.PROPERTIES][DAM.ASSET_READONLY];
};

/**
 * Converts the file into a generic object suitable for transport outside of the backend.
 * @return {object} An object containing information about the file.
 */
DAMFile.prototype.toObject = function () {
  var obj = JCRFile.prototype.toObject.call(this);
  obj['properties'] = this.content[DAM.PROPERTIES];
  return obj;
};

/**
 * Return the file size.
 *
 * @return {Number} file size, in bytes
 */
DAMFile.prototype.size = function () {
  // call base class method
  return JCRFile.prototype.size.call(this);
};

/**
 * Return the number of bytes that are allocated to the file.
 *
 * @return {Number} allocation size, in bytes
 */
DAMFile.prototype.allocationSize = function () {
  // call base class method
  return JCRFile.prototype.allocationSize.call(this);
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last modification
 */
DAMFile.prototype.lastModified = function () {
  if (this.isFile() && this.content[DAM.PROPERTIES][JCR.JCR_LASTMODIFIED]) {
    return new Date(this.content[DAM.PROPERTIES][JCR.JCR_LASTMODIFIED]).getTime();
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
DAMFile.prototype.setLastModified = function (ms) {
  if (this.isFile()) {
    // update lastModified (transient)
    this.content[DAM.PROPERTIES][JCR.JCR_LASTMODIFIED] = new Date(ms).toISOString();
  }
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
DAMFile.prototype.lastChanged = function () {
  // todo correct?
  return this.created();
};

/**
 * Return the create time, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
DAMFile.prototype.created = function () {
  return new Date(this.content[DAM.PROPERTIES][JCR.JCR_CREATED] || 0).getTime();
};

/**
 * Return the time of last access, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
DAMFile.prototype.lastAccessed = function () {
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
DAMFile.prototype.read = function (buffer, offset, length, position, cb) {
  // call base class method
  return JCRFile.prototype.read.call(this, buffer, offset, length, position, cb);
};

/**
 * Write bytes at a certain position inside the file.
 *
 * @param {Buffer} data buffer to write
 * @param {Number} position position inside file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMFile.prototype.write = function (data, position, cb) {
  // call base class method
  return JCRFile.prototype.write.call(this, data, position, cb);
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMFile.prototype.setLength = function (length, cb) {
  // call base class method
  return JCRFile.prototype.setLength.call(this, length, cb);
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMFile.prototype.delete = function (cb) {
  logger.debug('[%s] file.delete %s', this.tree.share.config.backend, this.filePath);
  var url = this.tree.share.buildResourceUrl(this.filePath);
  var options = this.tree.share.applyRequestDefaults({
    url: url,
    method: 'DELETE'
  });
  var self = this;
  webutils.submitRequest(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to delete %s', self.filePath, err);
      cb(SMBError.fromSystemError(err, 'unable to delete file due to unknown error ' + self.filePath));
    } else if (resp.statusCode !== 200) {
      logger.error('failed to delete %s - %s %s [%d]', self.filePath, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, 'unable to delete file due to unexpected status code ' + resp.statusCode + ' ' + self.filePath));
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
DAMFile.prototype.flush = function (cb) {
  // call base class method
  return JCRFile.prototype.flush.call(this, cb);
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMFile.prototype.close = function (cb) {
  // call base class method
  return JCRFile.prototype.close.call(this, cb);
};

module.exports = DAMFile;


