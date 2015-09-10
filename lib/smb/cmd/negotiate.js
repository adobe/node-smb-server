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
var util = require('../../utils');

var ZERO = new Buffer([0]);

// Max multiplex count.
var MAX_MPX_COUNT = 50;
// Max number of virtual circuits.
var MAX_NUMBER_VCS = 1;
// Max buffer size.
var MAX_BUFFER_SIZE = 33028;
// Max raw size.
var MAX_RAW_SIZE = 65536;

/**
 *
 * @param msg a SMB message object
 * @param connection a SMBConnection instance
 * @param server a SMBServer instance
 */
function handle(msg, connection, server) {
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

  logger.debug('[%s] dialects: %s', msg.header.command, msg.dialects);

  var idx = 0xffff;
  for (var i = 0; i < msg.dialects.length; i++) {
    if (msg.dialects[i] === consts.DIALECT_NT_LM_0_12) {
      idx = i;
      break;
    }
  }

  // send response

  if (idx == 0xffff) {
    // couldn't agree on a dialect
    msg.params = new Buffer(2);
    msg.params.writeUint16LE(idx);
    connection.sendResponse(msg);
    return;
  }
  var login = server.createLogin();

  var params = new Buffer(2 * 17);
  var offset = 0;
  // DialectIndex
  params.writeUInt16LE(idx, offset);
  offset += 2;
  // SecurityMode
  params.writeUInt8(consts.NEGOTIATE_USER_SECURITY | consts.NEGOTIATE_ENCRYPT_PASSWORDS, offset);
  offset += 1;
  // MaxMpxCount
  params.writeUInt16LE(MAX_MPX_COUNT, offset);
  offset += 2;
  // MaxNumberVcs
  params.writeUInt16LE(MAX_NUMBER_VCS, offset);
  offset += 2;
  // MaxBufferSize (todo verify)
  //params.writeUInt32LE(consts.SMB_MAX_LENGTH, offset);
  params.writeUInt32LE(MAX_BUFFER_SIZE, offset);
  offset += 4;
  // MaxRawSize (todo verify)
  params.writeUInt32LE(MAX_RAW_SIZE, offset);
  offset += 4;
  // SessionKey
  params.writeUInt32LE(login.key, offset);
  offset += 4;
  // Capabilities
  params.writeUInt32LE(
    consts.CAP_STATUS32 | consts.CAP_LEVEL2_OPLOCKS |
    consts.CAP_NT_SMBS | consts.CAP_NT_FIND |
    consts.CAP_LOCK_AND_READ | consts.CAP_RAW_MODE |
    consts.CAP_LARGE_FILES | consts.CAP_UNICODE,
    offset
  );
  offset += 4;
  // SystemTime
  var long = util.SystemToSMBTime(Date.now());
  params.writeUInt32LE(long.getLowBitsUnsigned(), offset);
  offset += 4;
  params.writeUInt32LE(long.getHighBitsUnsigned(), offset);
  offset += 4;
  // ServerTimeZone
  params.writeInt16LE(new Date().getTimezoneOffset(), offset);
  offset += 2;
  // ChallengeLength
  params.writeUInt8(login.challenge.length, offset);
  offset += 1;
  msg.params = params;

  var encDomain = new Buffer(server.domainName, 'utf16le');
  var data = new Buffer(login.challenge.length + encDomain.length + 1);
  offset = 0;
  // Challenge
  login.challenge.copy(data, offset);
  offset += login.challenge.length;
  // DomainName
  encDomain.copy(data, offset);
  offset += encDomain.length;
  data.writeUInt8(0, offset);
  offset += 1;
  msg.data = data;

  connection.sendResponse(msg);
}

module.exports = handle;