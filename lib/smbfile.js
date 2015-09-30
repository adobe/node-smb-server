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
  this.fid = fid === undefined ? 0 : fid;
}

SMBFile.prototype.getOpenAction = function () {
  return this.openAction;
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
 * Sets the length of the file.
 *
 * @param {Number} length new length of file
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
SMBFile.prototype.setLength = function (length, cb) {
  this.spiFile.setLength(length, cb);
};

module.exports = SMBFile;

