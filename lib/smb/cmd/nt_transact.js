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
var logger = require('winston').loggers.get('smb');
var _ = require('lodash');

var ntstatus = require('../../ntstatus');
var SMB = require('../constants');
var utils = require('../../utils');

var subCmdHandlers = {};

function loadSubCmdHandlers() {
  var p = path.join(__dirname, 'nttrans');
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
 * SMB_COM_NT_TRANSACT (0xA0): SMB_COM_NT_TRANSACT subcommands extend the file system feature access
 * offered by SMB_COM_TRANSACTION2.
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
  var paramsObj = parser.word8le('maxSetupCount')
    .skip(2)  // reserved1
    .word32le('totalParameterCount')  // bytes (not words)
    .word32le('totalDataCount')
    .word32le('maxParameterCount')  // bytes (not words)
    .word32le('maxDataCount')
    .word32le('parameterCount')  // bytes (not words)
    .word32le('parameterOffset')
    .word32le('dataCount')
    .word32le('dataOffset')
    .word8le('setupCount')
    .word16le('function')
    .buffer('setup', 2 * parser.vars['setupCount'])
    .vars;
  _.assign(msg, paramsObj);

  var result;

  msg.subCommandId = msg.function;
  var subCommand = SMB.NTTRANS_SUBCOMMAND_TO_STRING[msg.subCommandId];
  if (!subCommand) {
    logger.error('encountered invalid subcommand 0x%s', msg.subCommandId.toString(16));
    result = {
      status: ntstatus.STATUS_SMB_BAD_COMMAND,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  // decode data
  // calculate pad length for 4 byte alignment
  var off = utils.calculatePadLength(commandDataOffset, 4);
  var NT_Trans_Parameters = commandData.slice(off, off + msg.parameterCount);
  off += msg.parameterCount;
  // calculate pad length for 4 byte alignment
  off += utils.calculatePadLength(off, 4);
  var NT_Trans_Data = commandData.slice(off, off + msg.dataCount);
  off += msg.dataCount;

  var subParams = msg.buf.slice(msg.parameterOffset, msg.parameterOffset + msg.parameterCount);
  var subData =  msg.buf.slice(msg.dataOffset, msg.dataOffset + msg.dataCount);

  logger.debug('[%s][%s] totalParameterCount: %d, parameterCount: %d, totalDataCount: %d, dataCount: %d, setup: 0x%s', SMB.COMMAND_TO_STRING[commandId].toUpperCase(), subCommand.toUpperCase(), msg.totalParameterCount, msg.parameterCount, msg.totalDataCount, msg.dataCount,  msg.setup.toString('hex'));

  if (msg.parameterCount < msg.totalParameterCount || msg.dataCount < msg.totalDataCount) {
    // todo support nt_transact_secondary messages (reassembling chunked nt_transact messages)
    logger.error('chunked nt_transact messages are not yet supported.');
    result = {
      status: ntstatus.STATUS_NOT_IMPLEMENTED,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  // invoke subcommand handler
  var handler = subCmdHandlers[subCommand];
  if (handler) {
    if (msg.subCommandId === 0x0004) {  // nt_transact_notify_change
      // nt_transact_notify_change has a special contract:
      // it does send an immediate null or error response potentially followed
      // by an out-of-band response with the change notification at some later point in time.
      handler(msg, msg.subCommandId, subParams, subData, msg.parameterOffset, msg.dataOffset, connection, server, function (result) {
        var res = buildResponse(result);
        if (res && res.status === ntstatus.STATUS_SUCCESS) {
          // send out-of-band response (one shot notification)
          msg.commands[0].params = res.params;
          msg.commands[0].data = res.data;
          connection.sendResponse(msg, ntstatus.STATUS_SUCCESS, function (err) {
            if (err) {
              logger.error('[%s] failed to send notification response', subCommand.toUpperCase(), err);
            }
          });

        } else {
          // null or error response: invoke callback immediately
          cb(res);
        }
      });
    } else {
      handler(msg, msg.subCommandId, subParams, subData, msg.parameterOffset, msg.dataOffset, connection, server, function (result) {
        // build and return response
        cb(buildResponse(result));
      });
    }
  } else {
    logger.error('encountered unsupported subcommand 0x%s \'%s\'', msg.subCommandId.toString(16), subCommand.toUpperCase());
    result = {
      status: ntstatus.STATUS_NOT_IMPLEMENTED,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    cb(result);
  }
}

function buildResponse(subResult) {
  if (!subResult) {
    // special case (see e.g. 'nt_transact_notify_change' handler): no further processing required
    return null;
  }

  if (subResult.status !== ntstatus.STATUS_SUCCESS) {
    return {
      status: subResult.status,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
  }

  // build response
  var subParams = subResult.params;
  var subData = subResult.data;
  var setup = subResult.setup || utils.EMPTY_BUFFER;

  // nt_transact response have a params length of 36 (18 words) plus length of setup
  var paramsLength = 36 + setup.length;
  var dataOffset = SMB.SMB_MIN_LENGTH + paramsLength;

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
  var paramsOut = put();
  paramsOut.pad(3)  // Reserved1
    .word32le(subParams.length) // TotalParameterCount
    .word32le(subData.length) // TotalDataCount
    .word32le(subParams.length) // ParameterCount
    .word32le(subParamsOffset)  // ParameterOffset
    .word32le(0) // ParameterDisplacement
    .word32le(subData.length) // DataCount
    .word32le(subDataOffset)  // DataOffset
    .word32le(0) // DataDisplacement
    .word8(setup.length ? setup.length / 2 : 0) // SetupCount
    .put(setup);  // Setup
  var params = paramsOut.buffer();

  // data
  var dataOut = put();
  dataOut.pad(pad1)
    .put(subParams)
    .pad(pad2)
    .put(subData);
  var data = dataOut.buffer();

  // return result
  return {
    status: ntstatus.STATUS_SUCCESS,
    params: params,
    data: data
  };
}

module.exports = handle;
