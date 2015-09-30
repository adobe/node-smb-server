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
var Path = require('path');
var fs = require('fs');

var File = require('../../spi/file');

/**
 * Creates an instance of File.
 *
 * @constructor
 * @this {FSFile}
 * @param {String} filePath normalized file path
 * @param {fs.Stats} stats fs.Stats object
 */
var FSFile = function (filePath, stats) {
  if (! (this instanceof FSFile)) {
    return new FSFile(filePath, stats);
  }
  this.stats = stats;

  File.call(this, filePath);
};

// the FSFile prototype inherits from File
util.inherits(FSFile, File);

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
FSFile.prototype.read = function (buffer, offset, length, position, cb) {
  fs.open(this.filePath, 'r', function (err, fd) {
    if (err) {
      cb(err);
      return;
    }
    fs.read(fd, buffer, offset, length, position, function (err, bytesRead, buffer) {
      fs.close(fd, function (ignored) {});
      if (err) {
        cb(err);
        return;
      }
      cb(err, bytesRead, buffer);
    });
  });
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
FSFile.prototype.setLength = function (length, cb) {
  fs.truncate(this.filePath, length, cb);
};

module.exports = FSFile;


