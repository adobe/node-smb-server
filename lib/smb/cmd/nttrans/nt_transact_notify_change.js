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
var binary = require('binary');

var consts = require('../../../constants');
var utils = require('../../../utils');

/**
 * NT_TRANSACT_NOTIFY_CHANGE (0x0004): This command notifies the client when the directory, specified by FID, is modified.
 * It also returns the names of all file system objects that changed, and the ways in which they were modified..
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
  // decode setup
  var parser = binary.parse(msg.setup);
  var setup = parser.word32le('completionFilter')
    .word16le('fid')
    .word8le('watchTree')
    .vars;

  var tree = server.getTree(msg.header.tid);
  var fileName = tree && tree.getFile(setup.fid) && tree.getFile(setup.fid).getName() || null;

  logger.debug('[%s] completionFilter: %s, fid: %d [fileName: %s], watchTree: %d', consts.NTTRANS_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), setup.completionFilter.toString(2), setup.fid, fileName, setup.watchTree);

  var result;
  if (!tree) {
    result = {
      status: consts.STATUS_SMB_BAD_TID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var file = tree.getFile(setup.fid);
  if (!file) {
    result = {
      status: consts.STATUS_SMB_BAD_FID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  // todo implement

  result = {
    status: consts.STATUS_NOT_IMPLEMENTED,
    params: commandParams,
    data: commandData
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;