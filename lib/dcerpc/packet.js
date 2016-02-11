/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
