/*
 *  Copyright 2015 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

'use strict';

var put = require('put');
var binary = require('binary');
var Long = require('long');
var logger = require('winston').loggers.get('smb');

var ntstatus = require('../../ntstatus');
var SMB = require('../constants');
var utils = require('../../utils');
var smb2 = require('../../smb2/handler');
var smb2Message = require('../../smb2/message');
var SMB2 = require('../../smb2/constants');

var ZERO = Buffer.from([ 0 ]);

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
 * @param {Number} commandParamsOffset - the command parameters offset within the SMB
 * @param {Number} commandDataOffset - the command data offset within the SMB
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
function handle(msg, commandId, commandParams, commandData, commandParamsOffset, commandDataOffset, connection, server, cb) {
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

  logger.debug('[%s] dialects: %s', SMB.COMMAND_TO_STRING[commandId].toUpperCase(), msg.dialects.toString());

  var result;

  // SMB2 handshake?
  if (!!server.config['smb2Support'] && msg.dialects.indexOf(SMB.DIALECT_SMB_2_X) > -1) {
    // handcraft an smb2 negotiate response
    // todo refactor into reusable separate function
    var buf = Buffer.alloc(SMB2.HEADER_LENGTH);
    buf.fill(0);
    var smb2Msg = smb2Message.decode(buf);
    smb2Msg.protocolId = SMB2.PROTOCOL_ID;
    smb2Msg.header.flags.reply = true;
    smb2Msg.header.commandId = SMB2.STRING_TO_COMMAND['negotiate'];
    smb2Msg.header.creditReqRes = 1;

    var systemTime = utils.systemToSMBTime(Date.now());
    var startTime = utils.systemToSMBTime(server.getStartTime());
    var securityBuffer = utils.EMPTY_BUFFER;
    var out = put();
    out.word16le(0x0041)  // StructureSize (fixed according to spec)
      .word16le(0) // SecurityMode
      .word16le(SMB2.SMB_2_X_X) // DialectRevision
      .word16le(0)  // NegotiateContextCount/Reserved
      .put(server.getGuid())  // ServerGuid
      .word32le(0) // Capabilities
      .word32le(0x00100000) // MaxTransactSize
      .word32le(0x00100000) // MaxReadSize
      .word32le(0x00100000) // MaxWriteSize
      .word32le(systemTime.getLowBitsUnsigned())  // SystemTime
      .word32le(systemTime.getHighBitsUnsigned())
      .word32le(startTime.getLowBitsUnsigned())  // ServerStartTime
      .word32le(startTime.getHighBitsUnsigned())
      .word16le(SMB2.HEADER_LENGTH + 64)  // SecurityBufferOffset
      .word16le(securityBuffer.length)  // SecurityBufferLength
      .word32le(0)  // NegotiateContextOffset/Reserved2
      .put(securityBuffer); // SecurityBuffer
    smb2Msg.body = out.buffer();
    smb2.sendResponse(smb2Msg, ntstatus.STATUS_SUCCESS, connection, server, function (err) {
      if (err) {
        logger.error('failed to send SMB2 negotiate response', err);
      }
      // we've already handled sending the response ourselves, no further processing required by the caller
      cb(null);
    });
    return;
  }

  var idx = msg.dialects.indexOf(SMB.DIALECT_NT_LM_0_12);

  // send response

  if (idx === -1) {
    // couldn't agree on a dialect
    result = {
      status: ntstatus.STATUS_SUCCESS,
      params: Buffer.alloc(2).writeUint16LE(0xffff),
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var capabilities = SMB.CAP_STATUS32 | SMB.CAP_LEVEL2_OPLOCKS |
    SMB.CAP_NT_SMBS | SMB.CAP_NT_FIND |
    SMB.CAP_LARGE_FILES | SMB.CAP_UNICODE |
    SMB.CAP_INFOLEVEL_PASSTHRU | SMB.CAP_RPC_REMOTE_APIS |
    SMB.CAP_LARGE_READX | SMB.CAP_LARGE_WRITEX |
    //SMB.CAP_LWIO |
    SMB.CAP_LOCK_AND_READ;

  var extendedSecurity = false;
  if (server.config.extendedSecurity) {
    if (msg.header.flags.security.extended) {
      capabilities |= SMB.CAP_EXTENDED_SECURITY;
      extendedSecurity = true;
    }
  }

  var login = server.createLogin();
  // fallback solution (if sessionKey is not transmitted in SMB header)
  connection.sessionKey = login.key;

  var params = Buffer.alloc(2 * 17);
  var offset = 0;
  // DialectIndex
  params.writeUInt16LE(idx, offset);
  offset += 2;
  // SecurityMode
  params.writeUInt8(SMB.NEGOTIATE_USER_SECURITY | SMB.NEGOTIATE_ENCRYPT_PASSWORDS, offset);
  offset += 1;
  // MaxMpxCount
  params.writeUInt16LE(MAX_MPX_COUNT, offset);
  offset += 2;
  // MaxNumberVcs
  params.writeUInt16LE(MAX_NUMBER_VCS, offset);
  offset += 2;
  // MaxBufferSize
  //params.writeUInt32LE(consts.SMB_MAX_LENGTH, offset);
  params.writeUInt32LE(MAX_BUFFER_SIZE, offset);
  offset += 4;
  // MaxRawSize
  params.writeUInt32LE(MAX_RAW_SIZE, offset);
  offset += 4;
  // SessionKey
  params.writeUInt32LE(login.key, offset);
  offset += 4;
  // Capabilities
  params.writeInt32LE(capabilities, offset);
  offset += 4;
  // SystemTime
  var long = utils.systemToSMBTime(Date.now());
  params.writeUInt32LE(long.getLowBitsUnsigned(), offset);
  offset += 4;
  params.writeUInt32LE(long.getHighBitsUnsigned(), offset);
  offset += 4;
  // ServerTimeZone
  params.writeInt16LE(new Date().getTimezoneOffset(), offset);
  offset += 2;
  // ChallengeLength
  params.writeUInt8(extendedSecurity ? 0 : login.challenge.length, offset);

  var data;
  offset = 0;
  if (extendedSecurity) {
    // todo securityBlob: raw NTLMSSP (empty) or SPNEGO (NegotiateToken)?
    var securityBlob = utils.EMPTY_BUFFER;
    data = Buffer.alloc(server.getGuid().length + securityBlob.length);
    // ServerGUID
    server.getGuid().copy(data, offset);
    offset += server.getGuid().length;
    // SecurityBlob
    securityBlob.copy(data, offset);
    offset += securityBlob.length;
  } else {
    var encDomain = Buffer.from(server.domainName, 'utf16le');
    var encServer = Buffer.from(server.hostName, 'utf16le');
    data = Buffer.alloc(login.challenge.length + encDomain.length + 2 + encServer.length + 2);
    // Challenge
    login.challenge.copy(data, offset);
    offset += login.challenge.length;
    // DomainName
    encDomain.copy(data, offset);
    offset += encDomain.length;
    data.writeUInt16LE(0, offset);  // sting delimiter (0x0000)
    // ServerName
    encServer.copy(data, offset);
    offset += encServer.length;
    data.writeUInt16LE(0, offset);  // sting delimiter (0x0000)
  }

  // return result
  result = {
    status: ntstatus.STATUS_SUCCESS,
    params: params,
    data: data
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;