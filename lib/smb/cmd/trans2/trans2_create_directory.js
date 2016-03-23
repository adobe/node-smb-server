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

var put = require('put');
var logger = require('winston').loggers.get('smb');
var async = require('async');

var ntstatus = require('../../../ntstatus');
var SMB = require('../../constants');
var utils = require('../../../utils');

/**
 * TRANS2_CREATE_DIRECTORY (0x000D): This transaction is used to create a new directory
 * and can be used to set extended attribute information.
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
  off += 4; // Reserved
  off += utils.calculatePadLength(commandParamsOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  var directoryName = utils.extractUnicodeBytes(commandParams, off).toString('utf16le');

  var eaList = utils.parseFEAList(commandData, 0);
  
  logger.debug('[%s] directoryName: %s', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), directoryName);

  var result;

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

  var eaErrorOffset = new Buffer([ 0x00, 0x00 ]);

  function create(callback) {
    tree.createDirectory(directoryName, callback);
  }

  function processEAs(dir, callback) {
    if (eaList && eaList.length) {
      // we're currently not supporting EAs
      eaErrorOffset.writeUInt16LE(eaList[0].offset, 0);
    }
    var result = {
      status: ntstatus.STATUS_SUCCESS,
      params: eaErrorOffset, // EaErrorOffset
      data: utils.EMPTY_BUFFER
    };
    callback(null, dir, result);
  }

  function close(dir, result, callback) {
    tree.closeFile(dir.getId(), function (ignored) {
      callback(null, result);
    });
  }

  async.waterfall([ create, processEAs, close ], function (err, result) {
    if (err) {
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
