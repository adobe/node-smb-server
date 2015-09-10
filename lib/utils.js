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
function SystemToSMBTime(ms) {
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
function SMBToSystemTime(l) {
  return l.div(10000).subtract(DELTA_EPOCH_MS).toNumber();
}

function isAndXCommand(cmdId) {
  return consts.COMMAND_TO_STRING[cmdId] && consts.COMMAND_TO_STRING[cmdId].substr(-5) === '_andx';
}

module.exports.SystemToSMBTime = SystemToSMBTime;
module.exports.SMBToSystemTime = SMBToSystemTime;
module.exports.isAndXCommand = isAndXCommand;