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

var logger = require('winston').loggers.get('smb');

var ntstatus = require('../../ntstatus');
var consts = require('../../constants');
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

  logger.debug('[%s] sid: %d', consts.COMMAND_TO_STRING[commandId].toUpperCase(), sid);

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