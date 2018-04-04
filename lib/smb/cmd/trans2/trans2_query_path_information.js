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
var logger = require('winston').loggers.get('smb');
var async = require('async');

var ntstatus = require('../../../ntstatus');
var infoLevel = require('../../queryInformationLevel');
var SMB = require('../../constants');
var utils = require('../../../utils');

/**
 * TRANS2_QUERY_PATH_INFORMATION (0x0005): This transaction is used to get information
 * about a specific file or directory.
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
  var off = 0;
  var informationLevel = commandParams.readUInt16LE(off);
  off += 2;
  off += 4; // reserved
  off += utils.calculatePadLength(commandParamsOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  var fileName = utils.extractUnicodeBytes(commandParams, off).toString('utf16le');

  logger.debug('[%s] informationLevel: %s, fileName: %s', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.QUERY_INFORMATION_LEVEL_TO_STRING[informationLevel], fileName | '');

  var result;

  if (informationLevel !== SMB.QUERY_INFO_STANDARD && !msg.header.flags.pathnames.long.supported) {
    result = {
      status: ntstatus.STATUS_INVALID_PARAMETER,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var tree = server.getTree(msg.header.tid);
  if (!tree) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_TID,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  function getFile(callback) {
    tree.open(fileName, callback);
  }

  function buildResult(file, callback) {
   var serializeResult = infoLevel.serialize(file, informationLevel);
    if (serializeResult.status !== ntstatus.STATUS_SUCCESS) {
      callback(null, file, {
        status: serializeResult.status,
        params: utils.EMPTY_BUFFER,
        data: utils.EMPTY_BUFFER
      });
    } else {
      callback(null, file, {
        status: serializeResult.status,
        params: informationLevel >= SMB.QUERY_FILE_BASIC_INFO ? new Buffer([ 0x00, 0x00 ]) : utils.EMPTY_BUFFER,
        data: serializeResult.buffer
      });
    }
  }

  function closeFile(file, result, callback) {
    tree.closeFile(file.getId(), function (ignored) {
      callback(null, result);
    });
  }

  async.waterfall([ getFile, buildResult, closeFile ], function (err, result) {
    if (err) {
      logger.error('[%s] informationLevel: %s, fileName: %s failed', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.QUERY_INFORMATION_LEVEL_TO_STRING[informationLevel], fileName, err);
      logger.error(err);
      cb({
        status: err.status || ntstatus.STATUS_UNSUCCESSFUL,
        params: utils.EMPTY_BUFFER,
        data: utils.EMPTY_BUFFER
      });
    } else {
      cb(result);
    }
  });
}

module.exports = handle;
