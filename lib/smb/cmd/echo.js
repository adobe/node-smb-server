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
var async = require('async');

var ntstatus = require('../../ntstatus');
var smb = require('../handler');
var SMB = require('../constants');

/**
 * SMB_COM_ECHO (0x2B): Echo request (ping).
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
  var echoCount = commandParams.readUInt16LE(0);

  logger.debug('[%s] echoCount: %d, data: %s', SMB.COMMAND_TO_STRING[commandId].toUpperCase(), echoCount, commandData.toString('hex'));

  var seq = 1;
  var params = [];
  while (echoCount-- > 0) {
    params.push(seq++);
  }
  async.eachSeries(
    params,
    function (param, callback) {
      commandParams.writeUInt16LE(param, 0);
      msg.commands[0].params = commandParams;
      msg.commands[0].data = commandData;
      smb.sendResponse(msg, ntstatus.STATUS_SUCCESS, connection, server, callback);
    },
    function (err) {
      if (err) {
        logger.error('failed to send echo response', err);
      }
      // we've already handled sending the response ourselves, no further processing required by the caller
      cb(null);
    }
  );
}

module.exports = handle;
