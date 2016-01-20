/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2016 Adobe Systems Incorporated
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

var binary = require('binary');
var logger = require('winston').loggers.get('smb');

var ntstatus = require('../../ntstatus');
var SMB2 = require('../constants');
var utils = require('../../utils');

/**
 * SMB2_NEGOTIATE (0x0000): Negotiate protocol dialect.
 *
 * @param {Object} msg - an SMB message object
 * @param {Number} commandId - the command id
 * @param {Buffer} body - the command specific message body
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
function handle(msg, commandId, body, connection, server, cb) {

  // todo implement

  // return result
  var result = {
    status: ntstatus.STATUS_NOT_IMPLEMENTED,
    body: utils.EMPTY_BUFFER
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;
