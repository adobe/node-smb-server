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
    .word16le('maxBufferSize')
    .word16le('maxMpxCount')
    .word16le('vcNumber')
    .word32le('sessionKey')
    .word16le('caseInsensitivePasswordLength')
    .word16le('caseSensitivePasswordLength')
    .skip(4)  // reserved
    .word32le('capabilities')
    .vars;
  _.assign(msg, params);

  // decode data
  var off = 0;
  msg.caseInsensitivePassword = msg.data.slice(off, off + msg.caseInsensitivePasswordLength);
  off += msg.caseInsensitivePasswordLength;
  msg.caseSensitivePassword = msg.data.slice(off, off + msg.caseSensitivePasswordLength);
  off += msg.caseSensitivePasswordLength;
  off += 1; // pad to align subsequent unicode strings (utf16le) on word boundary
  var bytes = utils.extractUnicodeBytes(msg.data, off);
  msg.accountName = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractUnicodeBytes(msg.data, off);
  msg.primaryDomain = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractUnicodeBytes(msg.data, off);
  msg.nativeOS = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractUnicodeBytes(msg.data, off);
  msg.nativeLanMan = bytes.toString('utf16le');
  off += bytes.length + 2;

  logger.debug('[%s] maxBufferSize: %d, maxMpxCount: %d, vcNumber: %d, sessionKey: %d, capabilities: %s, accountName: %s, primaryDomain: %s, nativeOS: %s, nativeLanMan: %s',
    msg.header.command, msg.maxBufferSize, msg.maxMpxCount, msg.vcNumber, msg.sessionKey, msg.capabilities.toString(2),
    msg.accountName, msg.primaryDomain, msg.nativeOS, msg.nativeLanMan);

  // authenticate/setup session
  var login = server.getLogin(msg.sessionKey);
  var session = server.setupSession(login, msg.accountName, msg.primaryDomain, msg.caseInsensitivePassword, msg.caseSensitivePassword);
  if (!session) {
    // authentication failure
    server.sendErrorResponse(msg, consts.STATUS_LOGON_FAILURE);
    return;
  }

  // build response
  msg.header.uid = session.uid;
  // params
  var out = put();
  out.word8(0xff) // andX prefix
    .word8(0) // reserved
    .word16le(0)  // andX offset
    .word16le(0);  // action
  msg.params = out.buffer();
  // data
  out = put();
  out.word8(0)  // pad to align subsequent unicode strings (utf16le) on word boundary
    .put(new Buffer(server.nativeOS, 'utf16le'))
    .word16le(0)  // delimiter
    .put(new Buffer(server.nativeLanMan, 'utf16le'))
    .word16le(0)  // delimiter
    .put(new Buffer(server.domainName, 'utf16le'))
    .word16le(0);  // delimiter
  msg.data = out.buffer();
  // send response
  connection.sendResponse(msg);
}

module.exports = handle;