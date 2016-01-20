/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2016 Adobe Systems Incorporated
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
var binary = require('binary');
var Long = require('long');

var ntstatus = require('../ntstatus');
var consts = require('./constants');
var flags = require('./flags');

function decode(buf) {
  // SMB uses little endian byte order!
  var parser = binary.parse(buf);
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
    .word16le('body.structureSize')
    .buffer('body.raw', 'body.structureSize')
    .vars;

  var cmdId = raw.command;
  var header = {
    commandId: cmdId,
    command: consts.COMMAND_TO_STRING[cmdId],
    status: raw.status,
    creditCharge: raw.creditCharge,
    creditReqRes: raw.creditReqRes,
    flags: flags.decode(raw.flags),
    nextCommand: raw.nextCommand,
    messageId: new Long(raw.messageIdRaw.slice(0, 4), raw.messageIdRaw.slice(4), true).toNumber(),
    treeId: raw.treeId,
    sessionId: new Long(raw.sessionIdRaw.slice(0, 4), raw.sessionIdRaw.slice(4), true).toNumber(),
    signature: raw.signature
  };

  return {
    protocolId: raw.protocolId,
    header: header,
    body: raw.body.raw,
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
    .word16le(msg.header.nextCommand)
    .put(msg.header.messageIdRaw)
    .pad(4)
    .word32le(msg.header.tid)
    .put(msg.header.sessionIdRaw)
    .put(msg.header.signature)
    .word16le(msg.body.length)
    .put(msg.body);

  return out.buffer();
}

module.exports.decode = decode;
module.exports.encode = encode;
