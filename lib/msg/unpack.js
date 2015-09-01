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

module.exports = unpack;

var flags = require('./flags');
var binary = require('binary');

var COMMAND_TO_STRING = {
  0x72: 'negotiate'
};

var COMMAND_PROC = {
  request: {
    negotiate: unpackNegotiate
  },
  reply: {
  }
};

function unpack(buf) {
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
    .buffer('params.words', 2*parser.vars['params']['wordCount'])
    .word16le('data.byteCount')
    .buffer('data.bytes', 'data.byteCount')
    .vars;

  var msg = {
    command: COMMAND_TO_STRING[raw.command],
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

  var proc = COMMAND_PROC[(msg.flags.reply ? 'reply' : 'request')][msg.command];
  if (typeof proc === 'function') {
    proc(msg);
  }

  return msg;
}

function unpackNegotiate(msg) {
  msg.dialects = [];

  var count = 0;

  binary.parse(msg.raw.data.bytes).loop(function (end, vars) {
    this.skip(1);
    count += 1;

    this.scan('dialect', new Buffer([0]));
    var dialect = vars['dialect'].toString();

    msg.dialects.push(dialect);
    count += dialect.length + 1;

    if (count >= msg.raw.data.byteCount) {
      end();
    }
  });
}
