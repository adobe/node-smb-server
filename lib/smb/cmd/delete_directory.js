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
var logger = require('winston').loggers.get('smb');

var consts = require('../../constants');
var utils = require('../../utils');

/**
 * SMB_COM_DELETE_DIRECTORY (0x01): This command is used to delete an empty directory.
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
  // decode data
  var off = 0;
  var bufferFormat = commandData.readUInt8(off); // 0x04
  off += 1;
  off += utils.calculatePadLength(commandDataOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  msg.directoryName = utils.extractUnicodeBytes(commandData, off).toString('utf16le');

  logger.debug('[%s] directoryName: %s', consts.COMMAND_TO_STRING[commandId].toUpperCase(), msg.directoryName);

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

  tree.exists(msg.directoryName, function (err, exists) {
    if (err) {
      cb({
        status: err.status || consts.STATUS_UNSUCCESSFUL,
        params: commandParams,
        data: commandData
      });
      return;
    }
    if (!exists) {
      cb({
        status: consts.STATUS_NO_SUCH_FILE,
        params: commandParams,
        data: commandData
      });
      return;
    }

    tree.deleteDirectory(msg.directoryName, function (err) {
      cb({
        status: err ? err.status || consts.STATUS_UNSUCCESSFUL : consts.STATUS_SUCCESS,
        params: utils.EMPTY_BUFFER,
        data: utils.EMPTY_BUFFER
      });
    });
  });
}

module.exports = handle;