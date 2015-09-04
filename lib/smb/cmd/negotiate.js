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
var logger = require('winston');

var consts = require('../../constants');

var ZERO = new Buffer([0]);

// Max multiplex count.
var MAX_MPX_COUNT = 50;
// Max number of virtual circuits.
var MAX_NUMBER_VCS = 1;
// Max buffer size.
var MAX_BUFFER_SIZE = 33028;
// Max raw size.
var MAX_RAW_SIZE = 65536;

function handle(msg, session) {
  // decode dialects
  msg.dialects = [];

  var read = 0;
  binary.parse(msg.data).loop(function (end, vars) {
    // buffer format (0x2: dialect)
    this.skip(1);
    read += 1;

    // extract dialect name (nul terminated)
    this.scan('dialect', ZERO);
    var dialect = vars['dialect'].toString();
    msg.dialects.push(dialect);
    read += dialect.length + 1;

    if (read >= msg.data.length) {
      end();
    }
  });

  logger.debug('dialects: ', msg.dialects);

  var idx = 0xffff;
  for (var i = 0; i < msg.dialects.length; i++) {
    if (msg.dialects[i] === consts.DIALECT_NT_LM_0_12) {
      idx = i;
      break;
    }
  }
  // todo send response
  if (idx == 0xffff) {
    // couldn't agree on a dialect
    msg.params = new Buffer(2);
    msg.params.writeUint16LE(idx);
    session.socket.sendResponse(msg);
    return;
  }
  var params = new Buffer(2 * 17);
  // DialectIndex
  params.writeUInt16LE(idx);
  // SecurityMode
  params.writeUInt8(consts.NEGOTIATE_USER_SECURITY | consts.NEGOTIATE_ENCRYPT_PASSWORDS);
  // MaxMpxCount
  params.writeUInt16LE(MAX_MPX_COUNT);
  // MaxNumberVcs
  params.writeUInt16LE(MAX_NUMBER_VCS);
  // MaxBufferSize (todo verify)
  //params.writeUInt32LE(consts.SMB_MAX_LENGTH);
  params.writeUInt32LE(MAX_BUFFER_SIZE);
  // MaxRawSize (todo verify)
  params.writeUInt32LE(MAX_RAW_SIZE);
  // SessionKey (todo verify)
  params.writeUInt32LE(?);



  // todo complete params and data
/*
  SMB_Parameters
  {
    UCHAR  WordCount;
    Words
    {
      USHORT   DialectIndex;
      UCHAR    SecurityMode;
      USHORT   MaxMpxCount;
      USHORT   MaxNumberVcs;
      ULONG    MaxBufferSize;
      ULONG    MaxRawSize;
      ULONG    SessionKey;
      ULONG    Capabilities;
      FILETIME SystemTime;
      SHORT    ServerTimeZone;
      UCHAR    ChallengeLength;
    }
  }
  SMB_Data
  {
    USHORT ByteCount;
    Bytes
    {
      UCHAR  Challenge[];
      SMB_STRING  DomainName[];
    }
  }
*/
}

module.exports = handle;