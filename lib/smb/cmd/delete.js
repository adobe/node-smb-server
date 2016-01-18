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
var async = require('async');

var ntstatus = require('../../ntstatus');
var SMB = require('../constants');
var utils = require('../../utils');

/**
 * SMB_COM_DELETE (0x06): This command is used by the client to delete one or more regular files.
 * It supports the use of wildcards in file names, allowing for deletion of multiple files in a single request.
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
  var bufferFormat = commandData.readUInt8(off);  // 0x04
  off += 1;
  off += utils.calculatePadLength(commandDataOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  var fileName = utils.extractUnicodeBytes(commandData, off).toString('utf16le');

  var matchLongNames = msg.header.flags.pathnames.long.supported;
  var inclHidden = !!(searchAttributes & SMB.ATTR_HIDDEN);
  var inclSystem = !!(searchAttributes & SMB.ATTR_SYSTEM);

  logger.debug('[%s] searchAttributes: %s, fileName: %s', SMB.COMMAND_TO_STRING[commandId].toUpperCase(), searchAttributes.toString(2), fileName);

  var result;
  var tree = server.getTree(msg.header.tid);
  if (!tree) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_TID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  tree.list(fileName, function (err, files) {
    if (err) {
      cb({
        status: err.status || ntstatus.STATUS_UNSUCCESSFUL,
        params: commandParams,
        data: commandData
      });
      return;
    }

    if (!files.length) {
      cb({
        status: ntstatus.STATUS_NO_SUCH_FILE,
        params: commandParams,
        data: commandData
      });
      return;
    }

    async.each(
      files,
      function (file, callback) {
        file.delete(callback);
      },
      function (err) {
        cb({
          status: err ? err.status || ntstatus.STATUS_UNSUCCESSFUL : ntstatus.STATUS_SUCCESS,
          params: utils.EMPTY_BUFFER,
          data: utils.EMPTY_BUFFER
        });
      }
    );
  });
}

module.exports = handle;