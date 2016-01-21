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

module.exports.parseCommonHeaderFields = parseCommonHeaderFields;
module.exports.serializeCommonHeaderFields = serializeCommonHeaderFields;
