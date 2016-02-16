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
 * SMB_COM_FIND_CLOSE2 (0x34): The SMB_COM_FIND_CLOSE2 command is used
 * to close a search handle that was created by a TRANS2_FIND_FIRST2 subcommand..
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
  var sid = commandParams.readUInt16LE(0);

  logger.debug('[%s] sid: %d', SMB.COMMAND_TO_STRING[commandId].toUpperCase(), sid);

  // close the search handle, i.e. release any resources associated with the handle
  // (there's nothing to do right now since we don't allocate resources for a search and don't track sid's)

  var result = {
    status: ntstatus.STATUS_SUCCESS,
    params: utils.EMPTY_BUFFER,
    data: utils.EMPTY_BUFFER
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;