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

var logger = require('winston').loggers.get('spi');

var File = require('../../spi/file');
var SMBError = require('../../smberror');
var ntstatus = require('../../ntstatus');

/**
 * Creates an instance of File.
 *
 * @constructor
 * @private
 * @this {IPCFile}
 * @param {String} filePath normalized file path
 * @param {IPCTree} tree tree object
 */
var IPCFile = function (filePath, tree) {
  logger.debug('[ipc] file.open %s', filePath);
  if (!(this instanceof IPCFile)) {
    return new IPCFile(filePath, tree);
  }
  this.writeable = true;

  File.call(this, filePath, tree);
};

// the IPCFile prototype inherits from File
util.inherits(IPCFile, File);

//---------------------------------------------------------------------< File >

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
IPCFile.prototype.isFile = function () {
  return true;
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
IPCFile.prototype.isDirectory = function () {
  return false;
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
IPCFile.prototype.isReadOnly = function () {
  return !this.writeable;
};

/**
 * Return the file size.
 *
 * @return {Number} file size, in bytes
 */
IPCFile.prototype.size = function () {
  return 0;
};

/**
 * Return the number of bytes that are allocated to the file.
 *
 * @return {Number} allocation size, in bytes
 */
IPCFile.prototype.allocationSize = function () {
  return 0;
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last modification
 */
IPCFile.prototype.lastModified = function () {
  return 0;
};

/**
 * Sets the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @param {Number} ms
 * @return {Number} time of last modification
 */
IPCFile.prototype.setLastModified = function (ms) {
  // ignoring ...
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
IPCFile.prototype.lastChanged = function () {
  return this.lastModified();
};

/**
 * Return the create time, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
IPCFile.prototype.created = function () {
  return 0;
};

/**
 * Return the time of last access, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
IPCFile.prototype.lastAccessed = function () {
  return 0;
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
IPCFile.prototype.read = function (buffer, offset, length, position, cb) {
  logger.debug('[ipc] file.read %s offset=%d, length=%d, position=%d', this.filePath, offset, length, position);
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_SMB_NO_SUPPORT)); });
};

/**
 * Write bytes at a certain position inside the file.
 *
 * @param {Buffer} data buffer to write
 * @param {Number} position position inside file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
IPCFile.prototype.write = function (data, position, cb) {
  logger.debug('[ipc] file.write %s data.length=%d, position=%d', this.filePath, data.length, position);
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_SMB_NO_SUPPORT)); });
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
IPCFile.prototype.setLength = function (length, cb) {
  logger.debug('[ipc] file.setLength %s length=%d', this.filePath, length);
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_SMB_NO_SUPPORT)); });
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
IPCFile.prototype.delete = function (cb) {
  logger.debug('[ipc] file.delete %s', this.filePath);
  process.nextTick(function () { cb(new SMBError(ntstatus.STATUS_SMB_NO_SUPPORT)); });
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
IPCFile.prototype.flush = function (cb) {
  logger.debug('[ipc] file.flush %s', this.filePath);
  // there's nothing to do here
  process.nextTick(function () { cb(); });
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
IPCFile.prototype.close = function (cb) {
  logger.debug('[ipc] file.close %s', this.filePath);
  // there's nothing to do here
  process.nextTick(function () { cb(); });
};

module.exports = IPCFile;


