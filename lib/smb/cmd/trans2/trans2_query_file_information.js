/*
 *  Copyright 2016 Adobe Systems Incorporated. All rights reserved.
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

var logger = require('winston').loggers.get('smb');

var ntstatus = require('../../../ntstatus');
var infoLevel = require('../../queryInformationLevel');
var SMB = require('../../constants');
var utils = require('../../../utils');

/**
 * TRANS2_QUERY_FILE_INFORMATION (0x0007): This transaction is an alternative to
 * TRANS2_QUERY_PATH_INFORMATION. The Trans2_Parameters of this request contain a FID
 * while the Trans2_Parameters of the TRANS2_QUERY_PATH_INFORMATION request contain a path string.
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
  var fid = commandParams.readUInt16LE(0);
  var informationLevel = commandParams.readUInt16LE(2);

  var tree = server.getTree(msg.header.tid);
  var fileName = tree && tree.getFile(fid) && tree.getFile(fid).getName() || null;

  logger.debug('[%s] informationLevel: %s, fileName: %s', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.QUERY_INFORMATION_LEVEL_TO_STRING[informationLevel], fileName);

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

  if (!tree) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_TID,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var file = tree.getFile(fid);
  if (!file) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_FID,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var serializeResult = infoLevel.serialize(file, informationLevel);
  if (serializeResult.status !== ntstatus.STATUS_SUCCESS) {
    result = {
      status: serializeResult.status,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
  } else {
    result = {
      status: serializeResult.status,
      params: informationLevel >= SMB.QUERY_FILE_BASIC_INFO ? new Buffer([ 0x00, 0x00 ]) : utils.EMPTY_BUFFER,
      data: serializeResult.buffer
    };
  }
  process.nextTick(function () { cb(result); });
}

module.exports = handle;
