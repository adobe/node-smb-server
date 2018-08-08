/*
 *  Copyright 2015 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

'use strict';

var put = require('put');
var logger = require('winston').loggers.get('dcerpc');

var consts = require('../constants');
var packet = require('../packet');
var utils = require('../../utils');

var assocGroupCounter = 0;

/**
 * BIND (0x0b): The bind PDU is used to initiate the presentation negotiation
 * for the body data, and optionally, authentication.
 *
 * @param {Object} hdr - common PDU header
 * @param {Buffer} buf - the raw PDU buffer
 * @param {SMBFile} pipe - an SMBFile instance
 * @param {SMBServer} server - an SMBServer instance
 * @param {Function} cb callback called with the PDU's response
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Buffer} cb.response buffer holding the bytes of the encoded response PDU
 */
function handle(hdr, buf, pipe, server, cb) {
  // parse bind specific header fields
  var off = consts.COMMON_HEADER_LENGTH;
  hdr.maxXmitFrag = buf.readUInt16LE(off);
  off += 2;
  hdr.maxRecvFrag = buf.readUInt16LE(off);
  off += 2;
  hdr.assocGroup = buf.readUInt32LE(off);
  off += 4;
  hdr.numCtxItems = buf.readUInt8(off);
  off += 1;
  off += 1; // reserved
  off += 2; // reserved2
  hdr.ctxs = [];
  var iCtx = 0;
  while (iCtx < hdr.numCtxItems) {
    var ctx = {};
    ctx.id = buf.readUInt16LE(off);
    off += 2;
    ctx.numTransItems = buf.readUInt8(off);
    off += 1;
    off += 1; // reserved
    ctx.syntax = {};
    ctx.syntax.uuidRaw = buf.slice(off, off + 16);
    ctx.syntax.uuid = utils.rawUUIDToString(ctx.syntax.uuidRaw);
    off += 16;
    ctx.syntax.version = buf.readUInt16LE(off);
    off += 2;
    ctx.syntax.versionMinor = buf.readUInt16LE(off);
    off += 2;
    ctx.trans = [];
    var iTrans = 0;
    while (iTrans < ctx.numTransItems) {
      var t = {
        syntax: {}
      };
      t.syntax.uuidRaw = buf.slice(off, off + 16);
      t.syntax.uuid = utils.rawUUIDToString(t.syntax.uuidRaw);
      off += 16;
      t.syntax.version = buf.readUInt16LE(off);
      off += 2;
      t.syntax.versionMinor = buf.readUInt16LE(off);
      off += 2;
      ctx.trans.push(t);
      iTrans++;
    }
    hdr.ctxs.push(ctx);
    iCtx++;
  }

  var syntaxSpec = hdr.ctxs[0].syntax;

  // build bind_ack/bind_nak response PDU
  var iface = consts.SUPPORTED_INTERFACES[syntaxSpec.uuid] && consts.SUPPORTED_INTERFACES[syntaxSpec.uuid][syntaxSpec.version + '.' + syntaxSpec.versionMinor];
  hdr.type = iface ? consts.STRING_TO_PDUTYPE['bind_ack'] : consts.STRING_TO_PDUTYPE['bind_nak'];
  var hdrBuf = packet.serializeCommonHeaderFields(hdr);

  var out = put();
  out.put(hdrBuf);
  if (iface) {
    // store uuid and version of bound interface as pipe property
    pipe.syntaxSpec = syntaxSpec;
    logger.debug('bound to %s v%d.%d (%s)', consts.SUPPORTED_INTERFACES[syntaxSpec.uuid].name, syntaxSpec.version, syntaxSpec.versionMinor, syntaxSpec.uuid);
    // bind_ack
    out.word16le(4280)  // max_xmit_frag
      .word16le(4280)  // max_recv_frag
      .word32le(hdr.assocGroup ? hdr.assocGroup : ++assocGroupCounter);  // assoc_group_id
    // secondary address
    var secAddr = '\\PIPE\\' + pipe.getName();
    out.word16le(secAddr.length + 1)
      .put(Buffer.from(secAddr, 'ascii'))
      .word8(0);
    // align on 32bit boundary
    var pad2 = utils.calculatePadLength(out.length(), 4);
    if (pad2) {
      out.pad(pad2);
    }
    out.word8(1)  // p_result_t.n_results
      .pad(1) // reserved
      .pad(2) // reserved2
      .word16le(0)  // p_result_t.result (0 === acceptance)
      .word16le(0)  // p_result_t.reason
      .put(hdr.ctxs[0].trans[0].syntax.uuidRaw) // p_result_t.t.transfer_syntax.if_uuid
      .word16le(hdr.ctxs[0].trans[0].syntax.version) // p_result_t.t.transfer_syntax.if_version
      .word16le(hdr.ctxs[0].trans[0].syntax.versionMinor);
  } else {
    // bind_nak
    out.word16le(consts.BIND_REJECT_REASON_NOT_SPECIFIED) // provider_reject_reason
      .word8(0);  // p_rt_versions_supported_t.n_protocols
  }

  var outBuf = out.buffer();
  // set actual fragLength
  outBuf.writeUInt16LE(outBuf.length, consts.HEADER_FRAGLENGTH_OFFSET);

  cb(null, outBuf);
}

module.exports = handle;