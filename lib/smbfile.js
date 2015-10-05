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

var logger = require('winston');

var consts = require('./constants');

/**
 * Represents a file opened by an SMB command.
 *
 * @param {File} spiFile
 * @param {Number} openAction
 * @param {Number} fid
 * @constructor
 */
function SMBFile(spiFile, openAction, fid) {
  this.spiFile = spiFile;
  this.openAction = openAction === undefined ? consts.OPEN_ACTION_EXISTED : openAction;
  if (spiFile.isDirectory()) {
    this.attributes = consts.ATTR_DIRECTORY;
  } else if (spiFile.isFile()) {
    this.attributes = consts.ATTR_NORMAL;
  } else {
    this.attributes = 0;
  }

  this.fid = fid === undefined ? 0 : fid;
}

SMBFile.prototype.getOpenAction = function () {
  return this.openAction;
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
 * Return the create time, in seconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
SMBFile.prototype.getCreatedTime = function () {
  return this.spiFile.created();
};

/**
 * Return the create time, in seconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
SMBFile.prototype.getLastModifiedTime = function () {
  return this.spiFile.lastModified();
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
 * Return the time of last access, in seconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
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
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Number} cb.bytesRead number of bytes actually read
 * @param {Buffer} cb.buffer buffer holding the bytes actually read
 */
SMBFile.prototype.read = function (buffer, offset, length, position, cb) {
  this.spiFile.read(buffer, offset, length, position, cb);
};

/**
 * Write bytes at a certain position inside the file.
 *
 * @param {Buffer} data buffer to write
 * @param {Number} position position inside file
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.write = function (data, position, cb) {
  this.spiFile.write(data, position, cb);
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.delete = function (cb) {
  this.spiFile.delete(cb);
};

/**
 * Sets the length of the file.
 *
 * @param {Number} length new length of file
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.setLength = function (length, cb) {
  this.spiFile.setLength(length, cb);
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.flush = function (cb) {
  this.spiFile.flush(cb);
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.close = function (cb) {
  this.spiFile.close(cb);
};

module.exports = SMBFile;

