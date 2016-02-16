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

var path = require('path');
var fs = require('fs');
var logger = require('winston').loggers.get('smb');

var ntstatus = require('../../../ntstatus');
var SMB = require('../../constants');
var utils = require('../../../utils');
var RPC = require('../../../dcerpc/constants');
var packet = require('../../../dcerpc/packet');

var pduHandlers = {};

function loadPDUHandlers() {
  var p = path.join(__dirname, '../../../dcerpc/pdu');
  var files = fs.readdirSync(p);
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var stat = fs.statSync(path.resolve(p, f));
    if (stat.isDirectory()) {
      continue;
    }
    if (f.substr(-3) === '.js') {
      f = f.slice(0, -3);
      pduHandlers[f] = require(path.resolve(p, f));
    }
  }
}
loadPDUHandlers();

/**
 * TRANS_TRANSACT_NMPIPE (0x0026):
 * The TRANS_TRANSACT_NMPIPE subcommand of the SMB_COM_TRANSACTION is used to execute
 * a transacted exchange against a named pipe.
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

  var fid = msg.setup.readUInt16LE(2);

  var tree = server.getTree(msg.header.tid);
  var fileName = tree && tree.getFile(fid) && tree.getFile(fid).getName() || null;

  logger.debug('[%s] fid: %d [fileName: %s], data: %s', SMB.TRANS_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), fid, fileName, commandData.toString('hex'));

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

  // decode PDU
  var hdr = packet.parseCommonHeaderFields(commandData);
  if (!hdr.firstFrag || !hdr.lastFrag) {
    // fragmented PDU
    logger.error('encountered fragmented', hdr.type.toString(16));
    result = {
      status: ntstatus.STATUS_INVALID_SMB,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }
  var pdu = RPC.PDUTYPE_TO_STRING[hdr.type];
  if (!pdu) {
    logger.error('encountered invalid PDU type 0x%s', hdr.type.toString(16));
    result = {
      status: ntstatus.STATUS_INVALID_SMB,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }
  if (!hdr.firstFrag || !hdr.lastFrag) {
    // fragmented PDU
    // todo support fragmented PDUs
    logger.error('encountered fragmented PDU %s', pdu);
    result = {
      status: ntstatus.STATUS_NOT_IMPLEMENTED,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  // invoke PDU handler
  var handler = pduHandlers[pdu];
  if (handler) {
    handler(hdr, commandData, file, server, function (err, response) {
      if (err) {
        result = {
          status: ntstatus.STATUS_UNSUCCESSFUL,
          params: utils.EMPTY_BUFFER,
          data: utils.EMPTY_BUFFER
        };
      } else {
        result = {
          status: ntstatus.STATUS_SUCCESS,
          params: utils.EMPTY_BUFFER,
          data: response
        };
      }
      cb(result);
    });
  } else {
    logger.error('encountered unsupported PDU type 0x%s \'%s\'', hdr.type.toString(16), pdu.toUpperCase());
    result = {
      status: ntstatus.STATUS_NOT_IMPLEMENTED,
      params: commandParams,
      data: commandData
    };
    cb(result);
  }
}

module.exports = handle;
