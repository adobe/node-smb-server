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

function handle(msg, session) {
  var echoCount = msg.params.readUInt16LE(0);

  logger.debug('echoCount: ', echoCount);

  if (!echoCount) {
    return;
  }

  var seq = 1;
  while (echoCount) {
    msg.params.writeUInt16LE(seq++);
    session.socket.sendResponse(msg);
    echoCount--;
  }
}

module.exports = handle;