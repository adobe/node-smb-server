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
var logger = require('winston').loggers.get('smb');

var consts = require('../../constants');
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
  var paramsObj = parser.skip(4) // skip andX header
    .word16le('maxBufferSize')
    .word16le('maxMpxCount')
    .word16le('vcNumber')
    .word32le('sessionKey')
    .word16le('caseInsensitivePasswordLength')
    .word16le('caseSensitivePasswordLength')
    .skip(4)  // reserved
    .word32le('capabilities')
    .vars;
  _.assign(msg, paramsObj);

  var result;

  // decode data
  var off = 0;
  msg.caseInsensitivePassword = commandData.slice(off, off + msg.caseInsensitivePasswordLength);
  off += msg.caseInsensitivePasswordLength;
  msg.caseSensitivePassword = commandData.slice(off, off + msg.caseSensitivePasswordLength);
  off += msg.caseSensitivePasswordLength;
  off += utils.calculatePadLength(commandDataOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  var bytes = utils.extractUnicodeBytes(commandData, off);
  msg.accountName = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractUnicodeBytes(commandData, off);
  msg.primaryDomain = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractUnicodeBytes(commandData, off);
  msg.nativeOS = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractUnicodeBytes(commandData, off);
  msg.nativeLanMan = bytes.toString('utf16le');
  off += bytes.length + 2;

  logger.debug('[%s] maxBufferSize: %d, maxMpxCount: %d, vcNumber: %d, sessionKey: %d, capabilities: %s, accountName: %s, primaryDomain: %s, nativeOS: %s, nativeLanMan: %s',
    consts.COMMAND_TO_STRING[commandId].toUpperCase(), msg.maxBufferSize, msg.maxMpxCount, msg.vcNumber, msg.sessionKey, msg.capabilities.toString(2),
    msg.accountName, msg.primaryDomain, msg.nativeOS, msg.nativeLanMan);

  // authenticate/setup session
  var login = server.getLogin(msg.sessionKey);
  server.setupSession(login, msg.accountName, msg.primaryDomain, msg.caseInsensitivePassword, msg.caseSensitivePassword, function (err, session) {
    if (err) {
      // authentication failure
      result = {
        status: consts.STATUS_LOGON_FAILURE,
        params: commandParams,
        data: commandData
      };
      cb(result);
      return;
    }

    session.client = {
      nativeOS: msg.nativeOS,
      nativeLanMan: msg.nativeLanMan
    };

    // build response
    msg.header.uid = session.uid;
    // params
    var out = put();
    out.word8(commandParams.readUInt8(0)) // andX next cmd id
      .word8(0) // andX reserved
      .word16le(commandParams.readUInt16LE(2))  // andX offset (needs to be recalculated by caller!)
      .word16le(0);  // action
    var params = out.buffer();
    // data
    out = put();
    out.word8(0)  // pad to align subsequent unicode strings (utf16le) on word boundary
      .put(new Buffer(server.nativeOS, 'utf16le')).word16le(0)
      .put(new Buffer(server.nativeLanMan, 'utf16le')).word16le(0)
      .put(new Buffer(server.domainName, 'utf16le')).word16le(0);
    var data = out.buffer();
    // return result
    result = {
      status: consts.STATUS_SUCCESS,
      params: params,
      data: data
    };
    cb(result);
  });
}

module.exports = handle;