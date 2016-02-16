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
var binary = require('binary');
var Long = require('long');

var ntstatus = require('../ntstatus');
var consts = require('./constants');
var flags = require('./flags');

function decode(buf) {
  // SMB uses little endian byte order!
  var parser = binary.parse(buf);
  // header
  var raw = parser.buffer('protocolId', 4)  // 0xfe, 'S', 'M', 'B'
    .word16le('structureSize')  // 64
    .word16le('creditCharge')
    .word32le('status')
    .word16le('command')
    .word16le('creditReqRes')
    .word32le('flags')
    .word32le('nextCommand')
    .buffer('messageIdRaw', 8)
    .skip(4)  // reserved
    .word32le('treeId')
    .buffer('sessionIdRaw', 8)
    .buffer('signature', 16)
    .vars;

  // raw body
  var body = buf.slice(consts.HEADER_LENGTH, raw.nextCommand ? raw.nextCommand : buf.length);

  var cmdId = raw.command;
  var header = {
    commandId: cmdId,
    command: consts.COMMAND_TO_STRING[cmdId],
    status: raw.status,
    creditCharge: raw.creditCharge,
    creditReqRes: raw.creditReqRes,
    flags: flags.decode(raw.flags),
    nextCommand: raw.nextCommand,
    messageId: new Long(raw.messageIdRaw.slice(0, 4), raw.messageIdRaw.slice(4), true),
    treeId: raw.treeId,
    sessionId: new Long(raw.sessionIdRaw.slice(0, 4), raw.sessionIdRaw.slice(4), true),
    signature: raw.signature
  };

  return {
    protocolId: raw.protocolId,
    header: header,
    body: body, // raw message body
    buf: buf  // raw message buffer
  };
}

function encode(msg) {
  var out = put();

  var flgs = flags.encode(msg.header.flags);

  // header
  out.put(msg.protocolId)
    .word16le(consts.HEADER_LENGTH)
    .word16le(msg.header.creditCharge)
    .word32le(msg.header.status)
    .word16le(msg.header.commandId)
    .word16le(msg.header.creditReqRes)
    .word32le(flgs)
    .word32le(msg.header.nextCommand)
    .word32le(msg.header.messageId.getLowBitsUnsigned())
    .word32le(msg.header.messageId.getHighBitsUnsigned())
    .pad(4)
    .word32le(msg.header.treeId)
    .word32le(msg.header.sessionId.getLowBitsUnsigned())
    .word32le(msg.header.sessionId.getHighBitsUnsigned())
    .put(msg.header.signature)
    // body
    .put(msg.body);

  return out.buffer();
}

module.exports.decode = decode;
module.exports.encode = encode;
