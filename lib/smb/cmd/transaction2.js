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

var path = require('path');
var fs = require('fs');
var put = require('put');
var binary = require('binary');
var logger = require('winston');
var _ = require('lodash');

var consts = require('../../constants');
var utils = require('../../utils');

var subCmdHandlers = {};

function loadSubCmdHandlers() {
  var p = path.join(__dirname, 'trans2');
  var files = fs.readdirSync(p);
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var stat = fs.statSync(path.resolve(p, f));
    if (stat.isDirectory()) {
      continue;
    }
    if (f.substr(-3) === '.js') {
      f = f.slice(0, -3);
      subCmdHandlers[f] = require(path.resolve(p, f));
    }
  }
}
loadSubCmdHandlers();

/**
 * SMB_COM_TRANSACTION2 (0x32): Transaction 2 format request/response.
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
  var subCommand = consts.TRANS2_SUBCOMMAND_TO_STRING[msg.subCommandId];
  if (!subCommand) {
    self.sendErrorResponse(msg, consts.STATUS_SMB_BAD_COMMAND);
    callback('encountered invalid subcommand 0x' + msg.subCommandId.toString(16));
    return;
  }

  // decode data
  var off = 0;
  msg.name = commandData[off];  // not used in transaction2
  off += 1;

  var subParams = msg.buf.slice(msg.parameterOffset, msg.parameterOffset + msg.parameterCount);
  var subData =  msg.buf.slice(msg.dataOffset, msg.dataOffset + msg.dataCount);

  logger.debug('[%s][%s] totalParameterCount: %d, parameterCount: %d, totalDataCount: %d, dataCount: %d, flags: %s', consts.COMMAND_TO_STRING[commandId].toUpperCase(), subCommand.toUpperCase(), msg.totalParameterCount, msg.parameterCount, msg.totalDataCount, msg.dataCount, msg.flags.toString(2));

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

  // invoke subcommand handler
  var handler = subCmdHandlers[subCommand];
  if (handler) {
    handler(msg, msg.subCommandId, subParams, subData, msg.parameterOffset, msg.dataOffset, connection, server, function (result) {
      if (result.status !== consts.STATUS_SUCCESS) {
        result.params = commandParams;
        result.data = commandData;
        cb(result);
        return;
      }

      // build response

      var subParams = result.params;
      var subData = result.data;

      // transaction2 response have a fixed params length of 20 (10 words)
      var paramsLength = 20;
      var dataOffset = consts.SMB_MIN_LENGTH + paramsLength;

      // calculate offsets and paddings
      var subParamsOffset, subDataOffset, pad1, pad2;
      var off = dataOffset;
      pad1 = utils.calculatePadLength(off, 4);
      off += pad1;
      subParamsOffset = off;
      off += subParams.length;
      pad2 = utils.calculatePadLength(off, 4);
      off += pad2;
      subDataOffset = off;
      off += subData.length;

      // params
      var out = put();
      out.word16le(subParams.length) // TotalParameterCount
        .word16le(subData.length) // TotalDataCount
        .word16le(0) // reserved
        .word16le(subParams.length) // ParameterCount
        .word16le(subParamsOffset)  // ParameterOffset
        .word16le(0) // ParameterDisplacement
        .word16le(subData.length) // DataCount
        .word16le(subDataOffset)  // DataOffset
        .word16le(0) // DataDisplacement
        .word8(0) // SetupCount
        .word8(0); // reserved
      var params = out.buffer();

      // data
      var out = put();
      out.pad(pad1)
        .put(subParams)
        .pad(pad2)
        .put(subData);
      var data = out.buffer();

      // return result
      result = {
        status: consts.STATUS_SUCCESS,
        params: params,
        data: data
      };
      cb(result);
    });
  } else {
    logger.error('encountered unsupported subcommand 0x%s \'%s\'', msg.subCommandId.toString(16), subCommand.toUpperCase());
    result = {
      status: consts.STATUS_NOT_IMPLEMENTED,
      params: commandParams,
      data: commandData
    };
    cb(result);
  }
}

module.exports = handle;