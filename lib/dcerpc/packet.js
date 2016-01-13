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

var put = require('put');

var consts = require('./constants');

function parseCommonHeaderFields(buf) {
  // decode common PDU header
  var hdr = {};
  var off = 0;
  hdr.version = buf.readUInt8(off);
  off += 1;
  hdr.versionMinor = buf.readUInt8(off);
  off += 1;
  hdr.type = buf.readUInt8(off);
  off += 1;
  hdr.flags = buf.readUInt8(off);
  hdr.firstFrag = !!(hdr.flags & consts.PFC_FIRST_FRAG);
  hdr.lastFrag = !!(hdr.flags & consts.PFC_LAST_FRAG);
  off += 1;
  hdr.dataRep = buf.slice(off, off + 4);
  off += 4;
  hdr.fragLength = buf.readUInt16LE(off);
  off += 2;
  hdr.authLength = buf.readUInt16LE(off);
  off += 2;
  hdr.callId = buf.readUInt32LE(off);
  off += 4;

  return hdr;
}

function serializeCommonHeaderFields(hdr) {
  // encode common PDU header
  var out = put();
  out.word8(hdr.version)
    .word8(hdr.versionMinor)
    .word8(hdr.type)
    .word8(hdr.flags)
    .put(hdr.dataRep)
    .word16le(hdr.fragLength)
    .word16le(hdr.authLength)
    .word32le(hdr.callId);
  return out.buffer();
}

function rawUUIDToString(buf) {
  var uuid = parseRawUUID(buf);
  return decimalToHex(uuid.time_low, 8)
    + '-' + decimalToHex(uuid.time_mid, 4)
    + '-' + decimalToHex(uuid.time_hi_and_version, 4)
    + '-' + decimalToHex(uuid.clock_seq_hi_and_reserved, 2) + decimalToHex(uuid.clock_seq_low, 2)
    + '-' + uuid.node.toString('hex');
}

function parseRawUUID(buf) {
  var uuid = {};
  var off = 0;
  uuid.time_low = buf.readUInt32LE(off);
  off += 4;
  uuid.time_mid = buf.readUInt16LE(off);
  off += 2;
  uuid.time_hi_and_version = buf.readUInt16LE(off);
  off += 2;
  uuid.clock_seq_hi_and_reserved = buf.readUInt8(off);
  off += 1;
  uuid.clock_seq_low = buf.readUInt8(off);
  off += 1;
  uuid.node = buf.slice(off, off + 6);
  return uuid;
}

function rawUUIDFromString(str) {
  // todo validation / error handling
  var parts = str.split('-');
  // parts.length === 5
  var b1 = new Buffer(parts[0], 'hex');
  var b2 = new Buffer(parts[1], 'hex');
  var b3 = new Buffer(parts[2], 'hex');
  var b4 = new Buffer(parts[3].substr(0, 2), 'hex');
  var b5 = new Buffer(parts[3].substr(2), 'hex');
  var b6 = new Buffer(parts[4], 'hex');
  return Buffer.concat([ b1, b2, b3, b4, b5, b6 ]);
}

function decimalToHex(d, padding) {
  var hex = Number(d).toString(16);
  padding = typeof (padding) === 'undefined' || padding === null ? 2 : padding;

  while (hex.length < padding) {
    hex = '0' + hex;
  }

  return hex;
}

module.exports.parseCommonHeaderFields = parseCommonHeaderFields;
module.exports.serializeCommonHeaderFields = serializeCommonHeaderFields;
module.exports.rawUUIDToString = rawUUIDToString;
module.exports.rawUUIDFromString = rawUUIDFromString;
