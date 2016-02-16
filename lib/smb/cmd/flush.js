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

var logger = require('winston').loggers.get('smb');

var ntstatus = require('../../ntstatus');
var SMB = require('../constants');
var utils = require('../../utils');

/**
 * SMB_COM_FLUSH (0x05): This command requests that the server flush data and allocation information
 * for a specified file or for all open files under the session.
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

  var tree = server.getTree(msg.header.tid);
  var fileName = tree && fid !== 0xffff && tree.getFile(fid) && tree.getFile(fid).getName() || null;

  logger.debug('[%s] fid: %d [fileName: %s]', SMB.COMMAND_TO_STRING[commandId].toUpperCase(), fid, fileName);

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
  var target;
  if (fid === 0xffff) {
    target = tree;
  } else {
    target = tree.getFile(fid);
    if (!target) {
      result = {
        status: ntstatus.STATUS_SMB_BAD_FID,
        params: commandParams,
        data: commandData
      };
      process.nextTick(function () { cb(result); });
      return;
    }
  }

  // flush file(s)
  target.flush(function (err) {
    cb({
      status: err ? err.status || ntstatus.STATUS_UNSUCCESSFUL : ntstatus.STATUS_SUCCESS,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    });
  });
}

module.exports = handle;