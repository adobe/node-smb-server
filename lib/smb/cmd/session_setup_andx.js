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
var _ = require('lodash');
var logger = require('winston').loggers.get('smb');

var ntlm = require('../../ntlm');
var ntlmssp = require('../../ntlmssp');
var ntstatus = require('../../ntstatus');
var SMB = require('../constants');
var utils = require('../../utils');

/**
 * SMB_COM_SESSION_SETUP_ANDX (0x73): Session Setup with AndX chaining.
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
  // decode params
  var parser = binary.parse(commandParams);

  var extendedSecurity = commandParams.length === 2 * 12;
  parser.skip(4) // skip andX header
    .word16le('maxBufferSize')
    .word16le('maxMpxCount')
    .word16le('vcNumber')
    .word32le('sessionKey');
  if (!extendedSecurity) {
    parser.word16le('caseInsensitivePasswordLength')
      .word16le('caseSensitivePasswordLength');
  } else {
    // extended security
    parser.word16le('securityBlobLength');
  }
  var paramsObj = parser.skip(4)  // reserved
    .word32le('capabilities')
    .vars;
  _.assign(msg, paramsObj);

  // decode data
  var off = 0;
  var bytes;
  if (extendedSecurity) {
    msg.securityBlob = commandData.slice(off, off + msg.securityBlobLength);
    off += msg.securityBlobLength;
    off += utils.calculatePadLength(commandDataOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  } else {
    msg.caseInsensitivePassword = commandData.slice(off, off + msg.caseInsensitivePasswordLength);
    off += msg.caseInsensitivePasswordLength;
    msg.caseSensitivePassword = commandData.slice(off, off + msg.caseSensitivePasswordLength);
    off += msg.caseSensitivePasswordLength;
    off += utils.calculatePadLength(commandDataOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
    bytes = utils.extractUnicodeBytes(commandData, off);
    msg.accountName = bytes.toString('utf16le');
    off += bytes.length + 2;
    bytes = utils.extractUnicodeBytes(commandData, off);
    msg.primaryDomain = bytes.toString('utf16le');
    off += bytes.length + 2;
  }
  bytes = utils.extractUnicodeBytes(commandData, off);
  msg.nativeOS = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractUnicodeBytes(commandData, off);
  msg.nativeLanMan = bytes.toString('utf16le');
  off += bytes.length + 2;

  function buildResult(status, uid, extSec, secBlob) {
    if (status !== ntstatus.STATUS_SUCCESS
      && status !== ntstatus.STATUS_MORE_PROCESSING_REQUIRED) {
      return {
        status: status,
        params: utils.EMPTY_BUFFER,
        data: utils.EMPTY_BUFFER
      };
    }
    msg.header.uid = uid;
    // params
    var out = put();
    out.word8(commandParams.readUInt8(0)) // andX next cmd id
      .word8(0) // andX reserved
      .word16le(commandParams.readUInt16LE(2))  // andX offset (needs to be recalculated by caller!)
      .word16le(0);  // action
    if (extSec) {
      out.word16le(secBlob.length); // securityBlobLength
    }
    var params = out.buffer();
    // data
    out = put();
    if (extSec) {
      out.put(secBlob);
    }
    // data always starts add an odd offset within the SMB message
    if (!(out.length % 2)) {
      // pad to align subsequent unicode strings (utf16le) on word boundary
      out.word8(0);
    }
    out.put(new Buffer(server.nativeOS, 'utf16le')).word16le(0)
      .put(new Buffer(server.nativeLanMan, 'utf16le')).word16le(0);
    if (!extSec) {
      out.put(new Buffer(server.domainName, 'utf16le')).word16le(0);
    }
    var data = out.buffer();
    // return result
    return {
      status: status,
      params: params,
      data: data
    };
  }

  // authenticate/setup session
  var login = server.getLogin(msg.sessionKey);
  var securityBlob = utils.EMPTY_BUFFER;
  if (extendedSecurity) {
    if (!login.negotiateMsg) {
      // parse NTLMSSP_NEGOTIATE msg
      var negMsg = ntlmssp.parseNegotiateMessage(msg.securityBlob);
      if (!negMsg) {
        cb(buildResult(ntstatus.STATUS_LOGON_FAILURE, 0, extendedSecurity, securityBlob));
        return;
      }
      login.negotiateMsg = negMsg;
      // create NTLMSSP_CHALLENGE msg
      securityBlob = ntlmssp.createChallengeMessage(negMsg.flags, login.challenge, server.hostName, server.domainName);
      cb(buildResult(ntstatus.STATUS_MORE_PROCESSING_REQUIRED, 0, extendedSecurity, securityBlob));
      return;
    } else {
      // parse NTLMSSP_AUTHENTICATE msg
      var authMsg = ntlmssp.parseAuthenticateMessage(msg.securityBlob);
      if (!authMsg) {
        cb(buildResult(ntstatus.STATUS_LOGON_FAILURE, 0, extendedSecurity, securityBlob));
        return;
      }
      msg.accountName = authMsg.user;
      msg.primaryDomain = authMsg.domain;
      msg.caseInsensitivePassword = authMsg.lmResponse;
      msg.caseSensitivePassword = authMsg.ntResponse;
      // fall through
    }
  }

  logger.debug('[%s] maxBufferSize: %d, maxMpxCount: %d, vcNumber: %d, sessionKey: %d, capabilities: %s, accountName: %s, primaryDomain: %s, nativeOS: %s, nativeLanMan: %s',
    SMB.COMMAND_TO_STRING[commandId].toUpperCase(), msg.maxBufferSize, msg.maxMpxCount, msg.vcNumber, msg.sessionKey, msg.capabilities.toString(2),
    msg.accountName, msg.primaryDomain, msg.nativeOS, msg.nativeLanMan);

  server.setupSession(login, msg.accountName, msg.primaryDomain, msg.caseInsensitivePassword, msg.caseSensitivePassword, function (err, session) {
    if (err) {
      // authentication failure
      cb(buildResult(ntstatus.STATUS_LOGON_FAILURE, 0, extendedSecurity, securityBlob));
      return;
    }

    session.client = {
      nativeOS: msg.nativeOS,
      nativeLanMan: msg.nativeLanMan
    };

    // build response
    cb(buildResult(ntstatus.STATUS_SUCCESS, session.uid, extendedSecurity, securityBlob));
  });
}

module.exports = handle;
