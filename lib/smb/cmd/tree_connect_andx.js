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
var _ = require('lodash');
var logger = require('winston');

var consts = require('../../constants');
var utils = require('../../utils');

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
  // decode params
  var parser = binary.parse(commandParams);
  var paramsObj = parser.skip(4) // skip andX header
    .word16le('flags')
    .word16le('passwordLength')
    .vars;
  _.assign(msg, paramsObj);

  // decode data
  var off = 0;
  msg.password = commandData.slice(off, off + msg.passwordLength);
  off += msg.passwordLength;
  var bytes = utils.extractUnicodeBytes(commandData, off);
  msg.path = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractAsciiBytes(commandData, off);
  msg.service = bytes.toString('ascii');
  off += bytes.length + 1;

  logger.debug('[%s] flags: %s, password: %s, service: %s', msg.header.command, msg.flags.toString(16), msg.password.toString('hex'), msg.service);

  // todo implement command

  // todo build response
  // params
  var out = put();
  out.word8(commandParams.readUInt8(0)) // andX next cmd id
    .word8(0) // andX reserved
    .word16le(commandParams.readUInt16LE(2))  // andX offset (needs to be recalculated by caller!)
    .word16le(0);  // action
  var params = out.buffer();
  // data
  out = put();
  //out.word8(0)
    //.put(new Buffer('blah', 'utf16le'));
  var data = out.buffer();
  // return result
  return {
    //status: consts.STATUS_SUCCESS,
    status: consts.STATUS_NOT_IMPLEMENTED,
    params: params,
    data: data
  };
}

module.exports = handle;