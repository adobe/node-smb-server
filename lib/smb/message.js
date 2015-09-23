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

  // unify andX and non-andX style message format: commands will be represented as array, even for andX-style messages
  msg.commands = [];
  decodeCommands(buf, header.commandId, params, data, msg.commands);

  return msg;
}

function decodeCommands(buf, commandId, params, data, commands) {
  commands.push({
    commandId: commandId,
    params: params,
    data: data
  });

  if (!utils.isAndXCommand(commandId)) {
    return;
  }

  // parse andX prefix
  var nextCmdId = params.readUIntLE(0, 1);
  var offset = params.readUIntLE(2, 2);

  if (nextCmdId != 0xff && offset) {
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

    // recurse
    decodeCommands(buf, nextCmdId, nextParams, nextData, commands);
  }
}

function encode(msg) {
  var out = put();

  var flgs = flags.encode(msg.header.flags);

  // header
  out.word8(0xff)
    .put(new Buffer('SMB'))
    .word8(msg.header.commandId)
    .word32le(msg.header.status)
    .word8(flgs.flags)
    .word16le(flgs.flags2)
    .word16le(msg.header.extra.pidHigh)
    .put(msg.header.extra.signature)
    .pad(2)
    .word16le(msg.header.tid)
    .word16le(msg.header.pid)
    .word16le(msg.header.uid)
    .word16le(msg.header.mid);

  var offset = consts.SMB_HEADER_LENGTH;

  // body (params, data)
  if (utils.isAndXCommand(msg.header.commandId)) {
    // andX-type message body with multiple params/data pairs

    for (var i = 0; i < msg.commands.length; i++) {
      var cmd = msg.commands[i];
      // next params/data block offset
      offset += (1 + cmd.params.length + 2 + cmd.data.length);
      // wordCount
      out.word8(cmd.params.length / 2);
      // andX header
      if (i === msg.commands.length - 1) {
        // last command in chain
        if (utils.isAndXCommand(cmd.commandId)) {
          // next andX command
          cmd.params.writeUInt8(0xff, 0);
          // andX reserved
          cmd.params.writeUInt8(0x0, 1);
          // andX offset
          cmd.params.writeUInt16LE(0x0, 2);
        }
      } else {
        // next andX command
        cmd.params.writeUInt8(msg.commands[i + 1].commandId, 0);
        // andX reserved
        cmd.params.writeUInt8(0x0, 1);
        // andX offset
        cmd.params.writeUInt16LE(offset);
      }
      // params
      out.put(cmd.params)
        // byteCount
        .word16le(cmd.data.length)
        // data
        .put(cmd.data);
    }
  } else {
    // regular message body with single params/data pair
    msg.params = msg.commands[0].params;
    msg.data = msg.commands[0].data;
    // wordCount
    out.word8(msg.params.length / 2)
      // params
      .put(msg.params)
      // byteCount
      .word16le(msg.data.length)
      // data
      .put(msg.data);
  }

  return out.buffer();
}

module.exports.decode = decode;
module.exports.encode = encode;
