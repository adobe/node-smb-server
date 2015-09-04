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
var binary = require('binary');

var consts = require('../constants');
var flags = require('./flags');

function decode(buf) {
  // SMB uses little endian byte order!
  var parser = binary.parse(buf);
  var raw = parser.buffer('protocol', 4)
    .word8('command')
    .word32le('status')
    .word8('flags')
    .word16le('flags2')
    .word16le('extra.pidHigh')
    .buffer('extra.signature', 8)
    .skip(2)
    .word16le('tid')
    .word16le('pid')
    .word16le('uid')
    .word16le('mid')
    .word8('params.wordCount')
    .buffer('params.words', 2 * parser.vars['params']['wordCount'])
    .word16le('data.byteCount')
    .buffer('data.bytes', 'data.byteCount')
    .vars;

  var msg = {
    _raw: raw,
    header: {
      command: consts.COMMAND_TO_STRING[raw.command],
      status: raw.status,
      flags: flags.decode(raw.flags, raw.flags2),
      extra: {
        pidHigh: raw.extra.pidHigh,
        signature: raw.extra.signature
      },
      tid: raw.tid,
      pid: raw.pid,
      uid: raw.uid,
      mid: raw.mid
    },
    params: raw.params.words,
    data: raw.data.bytes
  };

  return msg;
}

function encode(msg) {
  var out = put();

  var flgs = flags.encode(msg.header.flags);

  out.word8(0xff)
    .put(new Buffer('SMB'))
    .word8(consts.STRING_TO_COMMAND[msg.header.command])
    .word32le(msg.header.status)
    .word8(flgs.flags)
    .word16le(flgs.flags2)
    .word16le(msg.header.extra.pidHigh)
    .put(msg.header.extra.signature)
    .pad(2)
    .word16le(msg.header.tid)
    .word16le(msg.header.pid)
    .word16le(msg.header.uid)
    .word16le(msg.header.mid)
    .word8(msg.params.length / 2)
    .put(msg.params)
    .word16le(msg.data.length)
    .put(msg.data);

  return out.buffer();
}

module.exports.decode = decode;
module.exports.encode = encode;
