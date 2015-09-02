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

  var hdr = {
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
    mid: raw.mid,
    raw: raw
  };

  return hdr;
}

function encode(hdr) {
  var out = put();

  var flgs = flags.encode(hdr.flags);

  out.word8(0xff)
    .put(new Buffer('SMB'))
    .word8(consts.STRING_TO_COMMAND[hdr.command])
    .word32le(hdr.status)
    .word8(flgs.flags)
    .word16le(flgs.flags2)
    .word16le(hdr.extra.pidHigh)
    .put(hdr.extra.signature)
    .pad(2)
    .word16le(hdr.tid)
    .word16le(hdr.pid)
    .word16le(hdr.uid)
    .word16le(hdr.mid);

  // TODO: command specific params and data

  return out.buffer();
}

module.exports.decode = decode;
module.exports.encode = encode;
