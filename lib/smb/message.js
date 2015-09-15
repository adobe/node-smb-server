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
var _ = require('lodash');

var consts = require('../constants');
var utils = require('../utils');
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

  var cmdId = raw.command;
  var header = {
    commandId: cmdId,
    command: consts.COMMAND_TO_STRING[cmdId],
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
  };

  var params = raw.params.words;
  var data = raw.data.bytes;

  var msg = {
    header: header,
    params: params,
    data: data
  };

  if (utils.isAndXCommand(cmdId)) {
    msg.next = decodeAndXMessage(buf, header, params);
  }

  return msg;
}

function decodeAndXMessage(buf, header, params) {
  // parse andX prefix
  var nextCmdId = params.readUIntLE(0, 1);
  var offset = params.readUIntLE(2, 2);
  if (nextCmdId != 0xff && offset) {
    var hdr = _.clone(header);
    hdr.commandId = nextCmdId;
    hdr.command = consts.COMMAND_TO_STRING[nextCmdId];

    // extract params & data
    var nextBody = buf.slice(offset);
    var off = 0;
    var wordCount = nextBody.readUIntLE(off, 1);
    off += 1;
    var nextParams = nextBody.slice(off, off + (2 * wordCount));
    off += (2 * wordCount);
    var byteCount = nextBody.readUIntLE(off, 2);
    off += 2;
    var nextData = nextBody.slice(off, off + byteCount);

    // create new message
    var msg = {
      header: hdr,
      params: nextParams,
      data: nextData
    };
    if (utils.isAndXCommand(nextCmdId)) {
      // recurse
      msg.next = decodeAndXMessage(buf, header, nextParams);
    }
    return msg;
  } else {
    return null;
  }
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
