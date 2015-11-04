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
var fs = require('fs');

var logger = require('winston');
var tmp = require('temp').track();  // cleanup on exit
var request = require('request');

var File = require('../../spi/file');
var SMBError = require('../../smberror');
var consts = require('../../constants');
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
  if (! (this instanceof JCRFile)) {
    return new JCRFile(filePath, content, fileLength, tree);
  }
  this.content = content;
  this.tree = tree;
  this.fileLength = fileLength;

  File.call(this, filePath);
};

// the JCRFile prototype inherits from File
util.inherits(JCRFile, File);

JCRFile.isFile = function (primaryType) {
  return [ JCR.NT_FILE, JCR.DAM_ASSET ].indexOf(primaryType) > -1;
};

JCRFile.isDirectory = function (primaryType) {
  return [ JCR.NT_FOLDER, JCR.SLING_FOLDER, JCR.SLING_ORDEREDFOLDER ].indexOf(primaryType) > -1;
};

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
JCRFile.prototype.isFile = function () {
  return JCRFile.isFile(this.content[JCR.JCR_PRIMARYTYPE]);
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
JCRFile.prototype.isDirectory = function () {
  return JCRFile.isDirectory(this.content[JCR.JCR_PRIMARYTYPE]);
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
  throw new Error('abstract method');
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
JCRFile.prototype.write = function (data, position, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.setLength = function (length, cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.delete = function (cb) {
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.flush = function (cb) {
  // todo implement deferred write (spool local tmp file to server)
  process.nextTick(function () { cb(); });
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRFile.prototype.close = function (cb) {
  // todo delete local tmp file
  process.nextTick(function () { cb(); });
};

module.exports = JCRFile;


