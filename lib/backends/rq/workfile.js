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

var Path = require('path');
var util = require('util');
var logger = require('winston').loggers.get('spi');

var File = require('../../spi/file');

/**
 * Creates an instance of RQWorkFile.
 *
 * @constructor
 * @private
 * @this {RQWorkFile}
 * @param {String} filePath normalized file path
 * @param {File} sourceFile The wrapped file that the work file will use as its underlying file.
 * @param {RQTree} tree tree object
 */
var RQWorkFile = function (filePath, sourceFile, data, tree) {
  if (!(this instanceof RQWorkFile)) {
    return new RQWorkFile(filePath, sourceFile, data, tree);
  }

  this.source = sourceFile;
  this.data = data || {};

  File.call(this, filePath, tree);
};

// the RQWorkFile prototype inherits from File
util.inherits(RQWorkFile, File);

RQWorkFile.createInstance = function (filePath, sourceFile, tree, cb) {
  if (sourceFile.isFile()) {
    var buffer = new Array(sourceFile.size());
    sourceFile.read(buffer, 0, sourceFile.size(), 0, function (err) {
      if (err) {
        cb(err);
      } else {
        var workData;
        try {
          workData = JSON.parse(buffer.join(''));
        } catch (e) {
          logger.warn('trying to read work file whose contents are not json %s', filePath, e);
        }
        cb(null, new RQWorkFile(filePath, sourceFile, workData || {}, tree));
      }
    });
  } else {
    cb(null, new RQWorkFile(filePath, sourceFile, {}, tree));
  }
};

/**
 * Returns a value indicating whether or not the target of the work file has been created locally.
 * @returns {bool} Will be truthy if the target file was created locally.
 */
RQWorkFile.prototype.isCreated = function () {
  return this.data.created ? true : false;
};

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
RQWorkFile.prototype.isFile = function () {
  return this.source.isFile();
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
RQWorkFile.prototype.isDirectory = function () {
  return this.source.isDirectory();
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
RQWorkFile.prototype.isReadOnly = function () {
  return this.source.isReadOnly();
};

/**
 * Return the file size.
 *
 * @return {Number} file size, in bytes
 */
RQWorkFile.prototype.size = function () {
  return this.source.size();
};

/**
 * Return the number of bytes that are allocated to the file.
 *
 * @return {Number} allocation size, in bytes
 */
RQWorkFile.prototype.allocationSize = function () {
  return this.source.allocationSize();
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last modification
 */
RQWorkFile.prototype.lastModified = function () {
  return this.source.lastModified();
};

/**
 * Sets the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @param {Number} ms
 * @return {Number} time of last modification
 */
RQWorkFile.prototype.setLastModified = function (ms) {
  this.source.setLastModified(ms);
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
RQWorkFile.prototype.lastChanged = function () {
  return this.source.lastChanged();
};

/**
 * Return the create time, in seconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
RQWorkFile.prototype.created = function () {
  return this.source.created();
};

/**
 * Return the time of last access, in seconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
RQWorkFile.prototype.lastAccessed = function () {
  return this.source.lastAccessed();
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
RQWorkFile.prototype.read = function (buffer, offset, length, position, cb) {
  this.source.read(buffer, offset, length, position, cb);
};

/**
 * Write bytes at a certain position inside the file.
 *
 * @param {Buffer} data buffer to write
 * @param {Number} position position inside file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkFile.prototype.write = function (data, position, cb) {
  this.source.write(data, position, cb);
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkFile.prototype.setLength = function (length, cb) {
  this.source.setLength(length, cb);
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkFile.prototype.delete = function (cb) {
  this.source.delete(cb);
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkFile.prototype.flush = function (cb) {
  this.source.flush(cb);
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkFile.prototype.close = function (cb) {
  this.source.close(cb);
};

module.exports = RQWorkFile;
