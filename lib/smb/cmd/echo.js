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
var binary = require('binary');
var logger = require('winston');

var consts = require('../../constants');

/**
 * SMB_COM_ECHO (0x2B): Echo request (ping).
 *
 * @param {Object} msg - an SMB message object
 * @param {Number} commandId - the command id
 * @param {Buffer} commandParams - the command parameters
 * @param {Buffer} commandData - the command data
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
function handle(msg, commandId, commandParams, commandData, connection, server, cb) {
  var echoCount = commandParams.readUInt16LE(0);

  logger.debug('[%s] echoCount: %d, data: %s', consts.COMMAND_TO_STRING[commandId], echoCount, commandData.toString('hex'));

  var seq = 1;
  while (echoCount-- > 0) {
    msg.params.writeUInt16LE(seq++);
    connection.sendResponse(msg);
  }

  // we've already handled sending the result ourselves, no further processing required by the caller
  process.nextTick(function () { cb(null); });
}

module.exports = handle;