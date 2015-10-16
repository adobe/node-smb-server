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

  logger.debug('[%s] fid: %d', consts.COMMAND_TO_STRING[commandId].toUpperCase(), fid);

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
  var target;
  if (fid === 0xffff) {
    target = tree;
  } else {
    target = tree.getFile(fid);
    if (!target) {
      result = {
        status: consts.STATUS_SMB_BAD_FID,
        params: commandParams,
        data: commandData
      };
      process.nextTick(function () { cb(result); });
      return;
    }
  }

  // flush file(s)
  target.flush(function (err) {
    if (err) {
      cb({
        status: consts.STATUS_UNSUCCESSFUL,
        params: commandParams,
        data: commandData
      });
    } else {
      cb({
        status: consts.STATUS_SUCCESS,
        params: utils.EMPTY_BUFFER,
        data: utils.EMPTY_BUFFER
      });
    }
  });
}

module.exports = handle;