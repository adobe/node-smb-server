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

var binary = require('binary');
var put = require('put');
var logger = require('winston').loggers.get('smb');
var _ = require('lodash');
var Long = require('long');

var ntstatus = require('../../ntstatus');
var SMB = require('../constants');
var utils = require('../../utils');

/**
 * SMB_COM_WRITE_ANDX (0x2F): This request is used to write bytes to a regular file, a named pipe,
 * or a directly accessible I/O device such as a serial port (COM) or printer port (LPT).
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
    .word16le('fid')
    .word32le('offset')
    .word32le('timeout')
    .word16le('writeMode')
    .word16le('remaining')
    .word16le('dataLengthHigh')
    .word16le('dataLength')
    .word16le('dataOffset')
    .vars;
  _.assign(msg, paramsObj);
  if (commandParams.length === 28) {
    // the last 4 bytes are offsetHigh
    msg.offset = Long.fromBits(msg.offset, commandParams.readUInt32LE(24), true).toNumber();
  }

  // data to be written
  var dataLength = msg.dataLength + (msg.dataLengthHigh << 16);
  var data = msg.buf.slice(msg.dataOffset, msg.dataOffset + dataLength);

  var tree = server.getTree(msg.header.tid);
  var fileName = tree && tree.getFile(msg.fid) && tree.getFile(msg.fid).getName() || null;

  logger.debug('[%s] fid: %d [fileName: %s], offset: %d, timeout: %d, remaining: %d, dataLengthHigh: %d, dataLength: %d, dataOffset: %d', SMB.COMMAND_TO_STRING[commandId].toUpperCase(), msg.fid, fileName, msg.offset, msg.timeout, msg.remaining, msg.dataLengthHigh, msg.dataLength, msg.dataOffset);

  var result;
  if (!tree) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_TID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }
  var file = tree.getFile(msg.fid);
  if (!file) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_FID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }
  if (file.isDirectory()) {
    result = {
      status: ntstatus.STATUS_FILE_IS_A_DIRECTORY,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  file.write(data, msg.offset, function (err) {
    if (err) {
      cb({
        status: err.status || ntstatus.STATUS_UNSUCCESSFUL,
        params: commandParams,
        data: commandData
      });
      return;
    }

    // params
    var out = put();
    out.word8(commandParams.readUInt8(0)) // andX next cmd id
      .word8(0) // andX reserved
      .word16le(commandParams.readUInt16LE(2))  // andX offset (needs to be recalculated by caller!)
      .word16le(data.length & 0xffff)  // Count
      .word16le(0)  // Available
      //.word16le(0xffff)  // Available
      .word16le(data.length >> 16)  // CountHigh
      .word16le(0);  // Reserved
    var params = out.buffer();

    result = {
      status: ntstatus.STATUS_SUCCESS,
      params: params,
      data: utils.EMPTY_BUFFER
    };
    cb(result);
  });
}

module.exports = handle;