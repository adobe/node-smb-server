/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var logger = require('winston').loggers.get('spi'),
    async = require('async');

var common = require('./common');

/**
 * Represents a file opened by an SMB command.
 *
 * @param {File} spiFile
 * @param {SMBTree} smbTree
 * @param {Number} [createAction = FILE_OPENED]
 * @param {Number} [fid = 0]
 * @constructor
 */
function SMBFile(spiFile, smbTree, createAction, fid) {
  this.spiFile = spiFile;
  this.smbTree = smbTree;
  this.createAction = createAction === undefined ? common.FILE_OPENED : createAction;
  this.attributes = 0;
  if (spiFile.isDirectory()) {
    this.attributes |= common.ATTR_DIRECTORY;
  } else if (spiFile.isFile()) {
    this.attributes |= common.ATTR_NORMAL;
  }
  if (spiFile.isHidden()) {
    this.attributes |= common.ATTR_HIDDEN;
  }
  if (spiFile.isReadOnly()) {
    this.attributes |= common.ATTR_READ_ONLY;
  }
  this.fid = fid === undefined ? 0 : fid;
  this.deleteOnClose = false;
}

SMBFile.prototype.getId = function () {
  return this.fid;
};

SMBFile.prototype.getTree = function () {
  return this.smbTree;
};

SMBFile.prototype.getCreateAction = function () {
  return this.createAction;
};

SMBFile.prototype.getAttributes = function () {
  return this.attributes;
};

/**
 * Return the file name.
 *
 * @return {String} file name
 */
SMBFile.prototype.getName = function () {
  return this.spiFile.getName();
};

/**
 * Return the file path.
 *
 * @return {String} file path
 */
SMBFile.prototype.getPath = function () {
  return this.spiFile.getPath();
};

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
SMBFile.prototype.isFile = function () {
  return this.spiFile.isFile();
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
SMBFile.prototype.isDirectory = function () {
  return this.spiFile.isDirectory();
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
SMBFile.prototype.isReadOnly = function () {
  return this.spiFile.isReadOnly();
};

/**
 * Return the file length in bytes or 0 in the case of a directory.
 *
 * @return {Number} file length, in bytes
 */
SMBFile.prototype.getDataSize = function () {
  return this.spiFile.isFile() ? this.spiFile.size() : 0;
};

/**
 * Return the number of bytes that are allocated to the file or 0 in the case of a directory.
 *
 * @return {Number} allocation size, in bytes
 */
SMBFile.prototype.getAllocationSize = function () {
  return this.spiFile.isFile() ? this.spiFile.allocationSize() : 0;
};

/**
 * Return the create time, in milliseconds since Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
SMBFile.prototype.getCreatedTime = function () {
  return this.spiFile.created();
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
SMBFile.prototype.getLastModifiedTime = function () {
  return this.spiFile.lastModified();
};

/**
 * Sets the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @param {Number} ms
 * @return {Number} time of last modification
 */
SMBFile.prototype.setLastModifiedTime = function (ms) {
  this.spiFile.setLastModified(ms);
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
SMBFile.prototype.getLastChangedTime = function () {
  return this.spiFile.lastChanged();
};

/**
 * Return the time of last access, in milliseconds since Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
SMBFile.prototype.getLastAccessedTime = function () {
  return this.spiFile.lastAccessed();
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
SMBFile.prototype.read = function (buffer, offset, length, position, cb) {
  logger.debug('[fid=%d] file.read %s offset=%d, length=%d, position=%d', this.fid, this.getPath(), offset, length, position);

  this.spiFile.read(buffer, offset, length, position, cb);
};

/**
 * Write bytes at a certain position inside the file.
 *
 * @param {Buffer} data buffer to write
 * @param {Number} position position inside file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.write = function (data, position, cb) {
  logger.debug('[fid=%d] file.write %s data.length=%d, position=%d', this.fid, this.getPath(), data.length, position);

  this.spiFile.write(data, position, cb);
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.delete = function (cb) {
  logger.debug('[fid=%d] file.delete %s', this.fid, this.getPath());

  this.spiFile.delete(cb);
  // notify registered change listeners
  this.smbTree.notifyChangeListeners(common.FILE_ACTION_REMOVED, this.getPath());
};

/**
 * Sets the length of the file.
 *
 * @param {Number} length new length of file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.setLength = function (length, cb) {
  logger.debug('[fid=%d] file.setLength %s length=%d', this.fid, this.getPath(), length);

  this.spiFile.setLength(length, cb);
};

/**
 * Delete this file when it will be closed.
 */
SMBFile.prototype.setDeleteOnClose = function () {
  logger.debug('[fid=%d] file.setDeleteOnClose %s', this.fid, this.getPath());

  this.deleteOnClose = true;
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.flush = function (cb) {
  logger.debug('[fid=%d] file.flush %s', this.fid, this.getPath());

  this.spiFile.flush(cb);
  // notify registered change listeners
  this.smbTree.notifyChangeListeners(common.FILE_ACTION_MODIFIED, this.getPath());
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.close = function (cb) {
  logger.debug('[fid=%d] file.close %s deleteOnClose=%d', this.fid, this.getPath(), this.deleteOnClose);
  var self = this;

  async.series([
    function (callback) {
      self.spiFile.close(callback);
    },
    function (callback) {
      if (self.deleteOnClose) {
        self.delete(callback);
      } else {
        callback();
      }
    }
    ], cb);
};

module.exports = SMBFile;

