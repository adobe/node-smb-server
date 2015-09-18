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
 * @param msg a SMB message object
 * @param connection a SMBConnection instance
 * @param server a SMBServer instance
 */
function handle(msg, connection, server) {

  logger.debug('[%s] uid: %d', msg.header.uid);

  var session = server.getSession(msg.header.uid);
  if (!session) {
    connection.sendErrorResponse(msg, consts.STATUS_SMB_BAD_UID);
    return;
  }

  // todo clean up and free session-bound resources

  server.removeSession(msg.header.uid);

  // todo implement proper andx response chaining

  // params
  var out = put();
  out.word8(0xff) // andX prefix
    .word8(0) // reserved
    .word16le(0)  // andX offset
    .word16le(0);  // action
  msg.params = out.buffer();

  // send response
  connection.sendResponse(msg);
}

module.exports = handle;