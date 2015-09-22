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

/**
 *
 * @param {Object} msg - an SMB message object
 * @param {Number} commandId - the command id
 * @param {Buffer} commandParams - the command parameters
 * @param {Buffer} commandData - the command data
 * @param {Object} connection - an SMBConnection instance
 * @param {Object} server - an SMBServer instance
 *
 * @returns {{status: Number, params: Buffer, data: Buffer}} - an object with the command's result params and data
 *                                                             or null if the handler already sent the response and
 *                                                             no further processing is required by the caller
 */
function handle(msg, commandId, commandParams, commandData, connection, server) {

  logger.debug('[%s] uid: %d', msg.header.uid);

  var session = server.getSession(msg.header.uid);
  if (!session) {
    return {
      status: consts.STATUS_SMB_BAD_UID,
      params: commandParams,
      data: commandData
    };
  }

  // todo clean up and free session-bound resources (via SPI?)

  server.removeSession(msg.header.uid);
  msg.header.uid = 0;

  // params
  var out = put();
  out.word8(commandParams.readUInt8(0)) // andX next cmd id
    .word8(0) // andX reserved
    .word16le(commandParams.readUInt16LE(2))  // andX offset (needs to be recalculated by caller!)
    .word16le(0);  // action
  var params = out.buffer();

  // return result
  return {
    status: consts.STATUS_SUCCESS,
    params: params,
    data: commandData
  };
}

module.exports = handle;