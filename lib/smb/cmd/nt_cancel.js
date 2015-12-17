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
var logger = require('winston').loggers.get('smb');

var consts = require('../../constants');
var utils = require('../../utils');

/**
 * SMB_COM_NT_CANCEL (0xA4): This command allows a client to request that a currently pending request be canceled.
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

  logger.debug('[%s] tid: %d, uid: %d, mid: %d, pid: %d', consts.COMMAND_TO_STRING[commandId].toUpperCase(), msg.header.tid, msg.header.uid, msg.header.mid, msg.header.pid);

  var tree = server.getTree(msg.header.tid);
  if (tree) {
    tree.cancelChangeListener(msg.header.mid);
  }

  // "The server MUST NOT send a corresponding response for this request."
  // no further processing required by the caller
  process.nextTick(function () { cb(null); });
}

module.exports = handle;