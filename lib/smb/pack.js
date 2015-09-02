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

var flags = require('./flags');

function pack(msg) {
  var out = put();

  var flgs = flags.encode(msg.flags);

  out.word8(0xff)
    .put(new Buffer('SMB'))
    .word8(COMMAND_FROM_STRING[msg.command])
    .word32le(msg.status)
    .word8(flgs.flags)
    .word16le(flgs.flags2)
    .word16le(msg.extra.pidHigh)
    .put(msg.extra.signature)
    .pad(2)
    .word16le(msg.tid)
    .word16le(msg.pid)
    .word16le(msg.uid)
    .word16le(msg.mid);

  // TODO: command specific params and data

  return out.buffer();
}

module.exports = unpack;