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

var Long = require('long');

var consts = require('./constants');

/**
 * Number of milliseconds between Jan 1, 1601, 00:00:00 UTC and Jan 1, 1970, 00:00:00.0.
 */
var DELTA_EPOCH_MS = 11644473600000;

/**
 * Converts the system time (number of milliseconds since Jan 1, 1970, 00:00:00 UTC)
 * to the SMB format time (number of 100ns since Jan 1, 1601, 00:00:00 UTC).
 *
 * @param {Number} ms number of milliseconds since Jan 1, 1970, 00:00:00 UTC.
 * @return {Long} a 64bit signed integer representing the number of 100ns since Jan 1, 1601, 00:00:00 UTC.
 */
function systemToSMBTime(ms) {
  var l = Long.fromNumber(ms);
  return l.add(DELTA_EPOCH_MS).multiply(10000);
}

/**
 * Converts the SMB format time (number of 100ns since Jan 1, 1601, 00:00:00 UTC)
 * to the number of milliseconds since Jan 1, 1970, 00:00:00 UTC.
 *
 * @param {Long} l a 64bit signed integer representing the number of 100ns since Jan 1, 1601, 00:00:00 UTC.
 * @return {Number} number of milliseconds since Jan 1, 1970, 00:00:00 UTC.
 */
function smbToSystemTime(l) {
  return l.div(10000).subtract(DELTA_EPOCH_MS).toNumber();
}

/**
 * Reads the 8 byte SMB format time and returns the
 * milliseconds since 1 January 1970 00:00:00 UTC (Unix Epoch).
 *
 * The following rules apply:
 * If the read 64bit value is -1 (0xFFFFFFFFFFFFFFFF) the return value is -1;
 * If the read 64bit value is 0 (0x0000000000000000) the return value is 0;
 * All other values are converted to the Unix Epoch.
 *
 * @param {Buffer} buf
 * @param {Number} pos
 * @return {Number} milliseconds since 1 January 1970 00:00:00 UTC (Unix Epoch)
 */
function readTimestamp(buf, pos) {
  var timeLow = buf.readUInt32LE(pos);
  var timeHigh = buf.readUInt32LE(pos + 4);
  if (timeLow === 0xffffffff && timeHigh === 0xffffffff) {
    return -1;
  } else if (!timeHigh && !timeLow) {
    return 0;
  } else {
    return new Date(smbToSystemTime(new Long(timeLow, timeHigh))).getTime();
  }
}

function isAndXCommand(cmdId) {
  return consts.COMMAND_TO_STRING[cmdId] && consts.COMMAND_TO_STRING[cmdId].substr(-5) === '_andx';
}

/**
 * Extracts the bytes of an 0x0000-delimited utf16le encoded string (excluding the delimiter)
 * @param buf
 * @param pos
 * @return {Buffer} bytes of a utf16le encoded string (excluding the 0x0000 delimiter)
 */
function extractUnicodeBytes(buf, pos) {
  var off = pos;
  while (buf.readUInt16LE(off)) {
    off += 2;
  }

  return buf.slice(pos, off);
}

/**
 * Extracts the bytes of an 0x00-delimited ascii encoded string (excluding the delimiter)
 * @param buf
 * @param pos
 * @return {Buffer} bytes of an ascii encoded string (excluding the 0x00 delimiter)
 */
function extractAsciiBytes(buf, pos) {
  var off = pos;
  while (buf.readUInt8(off)) {
    off += 1;
  }

  return buf.slice(pos, off);
}

function calculatePadLength(offset, alignment) {
  var pad = alignment - (offset % alignment);
  return pad < alignment ? pad : 0;
}

/**
 * Normalize a SMB file path or pattern. Converts backslashes to slashes, makes sure
 * the path name is absolute, and removes a trailing slash.
 *
 * @param {String} name name to normalize
 * @returns {String} normalized name
 */
function normalizeSMBFileName(name) {
  name = name.replace(/\\/g, '/');
  if (!name.length || (name.length && name.charAt(0) !== '/')) {
    name = '/' + name;
  }
  if (name.length > 1 && name.substr(-1) === '/') {
    name = name.substr(0, name.length - 1);
  }
  return name;
}

function bufferEquals(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    return undefined;
  }
  if (typeof a.equals === 'function') {
    // node >= v0.12
    return a.equals(b);
  }

  if (a.length !== b.length) {
    return false;
  }

  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Returns the last segment of a path
 *
 * @param {String} path
 * @return {String} last segment of path
 */
function getPathName(path) {
  var pos = path.lastIndexOf('/');
  if (pos === -1) {
    return path;
  }
  return path.slice(pos + 1);
}

/**
 * Returns the file extension
 *
 * @param {String} name path or file name
 * @returns {String} file extension
 */
function getFileExtension(name) {
  var pos = name.lastIndexOf('.');
  if (pos === -1) {
    return name;
  }
  return name.slice(pos + 1);
}

/**
 * Returns the parent path
 *
 * @param {String} path
 * @return {String} parent path
 */
function getParentPath(path) {
  var pos = path.lastIndexOf('/');
  if (pos === -1) {
    return null;
  }
  if (pos === 0) {
    return '/';
  }
  return path.slice(0, pos);
}

/**
 * Strips the specified parent path
 *
 * @param {String} path
 * @param {String} parentPath
 * @return {String} stripped path
 */
function stripParentPath(path, parentPath) {
  if (path === parentPath) {
    return '';
  }
  if (path.indexOf(parentPath) === 0) {
    path = path.substr(parentPath.length);
    if (path.length > 1 && path.substr(-1) === '/') {
      // strip trailing slash
      path = path.substr(0, path.length - 1);
    }
  }
  return path;
}

module.exports.EMPTY_BUFFER = new Buffer(0);

module.exports.systemToSMBTime = systemToSMBTime;
module.exports.smbToSystemTime = smbToSystemTime;
module.exports.readTimestamp = readTimestamp;
module.exports.isAndXCommand = isAndXCommand;
module.exports.extractUnicodeBytes = extractUnicodeBytes;
module.exports.extractAsciiBytes = extractAsciiBytes;
module.exports.calculatePadLength = calculatePadLength;
module.exports.normalizeSMBFileName = normalizeSMBFileName;
module.exports.bufferEquals = bufferEquals;
module.exports.getParentPath = getParentPath;
module.exports.stripParentPath = stripParentPath;
module.exports.getPathName = getPathName;
module.exports.getFileExtension = getFileExtension;
