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
 * @param msg a SMB message object
 * @param connection a SMBConnection instance
 * @param server a SMBServer instance
 */
function handle(msg, connection, server) {
  // decode params
  var parser = binary.parse(msg.params);
  var params = parser.skip(4) // skip andX header
    .word16le('flags')
    .word16le('passwordLength')
    .vars;
  _.assign(msg, params);

  // decode data
  var off = 0;
  msg.password = msg.data.slice(off, off + msg.passwordLength);
  off += msg.passwordLength;
  var bytes = utils.extractUnicodeBytes(msg.data, off);
  msg.path = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractAsciiBytes(msg.data, off);
  msg.service = bytes.toString('ascii');
  off += bytes.length + 1;

  logger.debug('[%s] flags: %s, password: %s, service: %s', msg.header.command, msg.flags.toString(16), msg.password.toString('hex'), msg.service);

  // todo implement command

  // todo build response
  // params
  var out = put();
  out.word8(0xff) // andX prefix
    .word8(0) // reserved
    .word16le(0)  // andX offset
    .word16le(0);  // action
  msg.params = out.buffer();
  // data
  out = put();
  //out.word8(0)
    //.put(new Buffer('blah', 'utf16le'));
  msg.data = out.buffer();
  // send response
  //connection.sendResponse(msg);

  connection.sendErrorResponse(msg, consts.STATUS_NOT_IMPLEMENTED);
}

module.exports = handle;