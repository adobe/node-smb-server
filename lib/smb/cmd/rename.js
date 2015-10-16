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
var logger = require('winston');

var consts = require('../../constants');
var utils = require('../../utils');

/**
 * SMB_COM_RENAME (0x07): This command changes the name of one or more files or directories.
 * It supports the use of wildcards in file names, allowing the renaming of multiple files in a single request.
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
  var searchAttributes = commandParams.readUInt16LE(0);

  // decode data
  var off = 0;
  var bufferFormat1 = commandData.readUInt8(off); // 0x04
  off += 1;
  off += utils.calculatePadLength(commandDataOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  var bytes = utils.extractUnicodeBytes(commandData, off);
  msg.oldFileName = bytes.toString('utf16le');
  off += bytes.length + 2;
  var bufferFormat2 = commandData.readUInt8(off); // 0x04
  off += 1;
  off += utils.calculatePadLength(commandDataOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  bytes = utils.extractUnicodeBytes(commandData, off);
  off += bytes.length + 2;
  msg.newFileName = bytes.toString('utf16le');

  var matchLongNames = msg.header.flags.pathnames.long.supported;

  logger.debug('[%s] searchAttributes: %s, oldFileName: %s, newFileName: %s', consts.COMMAND_TO_STRING[commandId].toUpperCase(), searchAttributes.toString(2), msg.oldFileName, msg.newFileName);

  var result;
  var tree = server.getTree(msg.header.tid);
  if (!tree) {
    result = {
      status: consts.STATUS_SMB_BAD_TID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  // todo implement

  result = {
    status: consts.STATUS_NOT_IMPLEMENTED,
    params: commandParams,
    data: commandData
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;