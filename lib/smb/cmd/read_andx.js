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

var binary = require('binary');
var put = require('put');
var logger = require('winston').loggers.get('smb');
var _ = require('lodash');

var ntstatus = require('../../ntstatus');
var SMB = require('../constants');

// data offset in response SMB (from header start)
var DATA_OFFSET = 60;

/**
 * SMB_COM_READ_ANDX (0x2E): This command is used to read bytes from a regular file,
 * a named pipe, or a directly accessible device such as a serial port (COM) or printer port (LPT).
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
    .word16le('maxCountOfBytesToReturn')
    .word16le('minCountOfBytesToReturn')
    .word32le('timeout')
    .word16le('remaining')
    .word32le('offsetHigh')
    .vars;
  _.assign(msg, paramsObj);

  var tree = server.getTree(msg.header.tid);
  var fileName = tree && tree.getFile(msg.fid) && tree.getFile(msg.fid).getName() || null;

  logger.debug('[%s] fid: %d [fileName: %s], offset: %d, maxCountOfBytesToReturn: %d, minCountOfBytesToReturn: %d, timeout: %d, remaining: %d, offsetHigh: %d', SMB.COMMAND_TO_STRING[commandId].toUpperCase(), msg.fid, fileName, msg.offset, msg.maxCountOfBytesToReturn, msg.minCountOfBytesToReturn, msg.timeout, msg.remaining, msg.offsetHigh);

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

  var buf = new Buffer(msg.maxCountOfBytesToReturn);
  file.read(buf, 0, buf.length, msg.offset, function (err, bytesRead, buffer) {
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
      .word16le(0)  // Available
      .word16le(0)  // DataCompactionMode
      .word16le(0)  // Reserved1
      .word16le(bytesRead)  // DataLength
      .word16le(DATA_OFFSET)  // DataOffset
      .pad(10);  // Reserved2
    var params = out.buffer();

    // data
    var data = new Buffer(1 + bytesRead);
    data.writeInt8(0, 0); // pad
    buf.copy(data, 1, 0, bytesRead);
    // return result
    result = {
      status: ntstatus.STATUS_SUCCESS,
      params: params,
      data: data
    };
    cb(result);
  });
}

module.exports = handle;