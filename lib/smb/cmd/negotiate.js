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
 * SMB_COM_NEGOTIATE (0x72): Negotiate protocol dialect.
 *
 * @param {Object} msg - an SMB message object
 * @param {Number} commandId - the command id
 * @param {Buffer} commandParams - the command parameters
 * @param {Buffer} commandData - the command data
 * @param {Object} connection - an SMBConnection instance
 * @param {Object} server - an SMBServer instance
 * @param {Function} cb callback called with the command's result
 * @param {Object} cb.result - an object with the command's result params and data
 *                             or null if the handler already sent the response and
 *                             no further processing is required by the caller
 * @param {Number} cb.result.status
 * @param {Buffer} cb.result.params
 * @param {Buffer} cb.result.data
 */
function handle(msg, commandId, commandParams, commandData, connection, server, cb) {
  // decode dialects
  msg.dialects = [];

  var read = 0;
  binary.parse(commandData).loop(function (end, vars) {
    // buffer format (0x2: dialect)
    this.skip(1);
    read += 1;

    // extract dialect name (nul terminated)
    this.scan('dialect', ZERO);
    var dialect = vars['dialect'].toString();
    msg.dialects.push(dialect);
    read += dialect.length + 1;

    if (read >= commandData.length) {
      end();
    }
  });

  logger.debug('[%s] dialects: %s', consts.COMMAND_TO_STRING[commandId], msg.dialects.toString());

  var result;

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
    result = {
      status: consts.STATUS_SUCCESS,
      params: new Buffer(2).writeUint16LE(idx),
      data: commandData
    };
    process.nextTick(function () { cb(result); });
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
  var long = util.systemToSMBTime(Date.now());
  params.writeUInt32LE(long.getLowBitsUnsigned(), offset);
  offset += 4;
  params.writeUInt32LE(long.getHighBitsUnsigned(), offset);
  offset += 4;
  // ServerTimeZone
  params.writeInt16LE(new Date().getTimezoneOffset(), offset);
  offset += 2;
  // ChallengeLength
  params.writeUInt8(login.challenge.length, offset);

  var encDomain = new Buffer(server.domainName, 'utf16le');
  var data = new Buffer(login.challenge.length + encDomain.length + 2);
  offset = 0;
  // Challenge
  login.challenge.copy(data, offset);
  offset += login.challenge.length;
  // DomainName
  encDomain.copy(data, offset);
  offset += encDomain.length;
  data.writeUInt16LE(0, offset);  // sting delimiter (0x0000)

  // return result
  result = {
    status: consts.STATUS_SUCCESS,
    params: params,
    data: data
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;