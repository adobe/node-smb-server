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
var _ = require('lodash');

var consts = require('../../constants');
var util = require('../../utils');

/**
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
  // decode params
  var parser = binary.parse(commandParams);
  var paramsObj = parser.word16le('totalParameterCount')
    .word16le('totalDataCount')
    .word16le('maxParameterCount')
    .word16le('maxDataCount')
    .word8le('maxSetupCount')
    .skip(1)  // reserved
    .word16le('flags')
    .word32le('timeout')
    .skip(2)  // reserved2
    .word16le('parameterCount')
    .word16le('parameterOffset')
    .word16le('dataCount')
    .word16le('dataOffset')
    .word8le('setupCount')
    .skip(1)  // reserved3
    .buffer('setup', 2 * parser.vars['setupCount'])
    .vars;
  _.assign(msg, paramsObj);

  msg.subCommandId = msg.setup.readUInt16LE(0);

  // decode data
  var off = 0;
  msg.name = commandData[off];  // not used in transaction2
  off += 1;

  var transParams = msg.buf.slice(msg.parameterOffset, msg.parameterOffset + msg.parameterCount);
  var transData =  msg.buf.slice(msg.dataOffset, msg.dataOffset + msg.dataCount);

  logger.debug('[%s][%s] totalParameterCount: %d, parameterCount: %d, totalDataCount: %d, dataCount: %d, flags: %s', consts.COMMAND_TO_STRING[commandId], consts.TRANS2_SUBCOMMAND_TO_STRING[msg.subCommandId], msg.totalParameterCount, msg.parameterCount, msg.totalDataCount, msg.dataCount, msg.flags.toString(2));

  if (msg.parameterCount < msg.totalParameterCount || msg.dataCount < msg.totalDataCount) {
    // todo support transaction2_secondary messages (reassembling chunked transaction2 messages)
    logger.error('chunked transaction2 messages are not yet supported.');
    result = {
      status: consts.STATUS_NOT_IMPLEMENTED,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var result;

  // todo invoke subcommand handler

  // send response


  // return result
  result = {
    //status: consts.STATUS_SUCCESS,
    status: consts.STATUS_NOT_IMPLEMENTED,
    params: params,
    data: data
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;