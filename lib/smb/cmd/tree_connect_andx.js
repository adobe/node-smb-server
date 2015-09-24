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

// optionalSupport
var SMB_SUPPORT_SEARCH_BITS = 0x1;
var SMB_SHARE_IS_IN_DFS = 0x2;
// nativeFileSystem
var NATIVE_FILE_SYSTEM = 'NTFS';  // todo test e.g. with 'JCR'

/**
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
  // decode params
  var parser = binary.parse(commandParams);
  var paramsObj = parser.skip(4) // skip andX header
    .word16le('flags')
    .word16le('passwordLength')
    .vars;
  _.assign(msg, paramsObj);

  var result;

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

  logger.debug('[%s] flags: %s, password: %s, service: %s', consts.COMMAND_TO_STRING[commandId], msg.flags.toString(16), msg.password.toString('hex'), msg.service);

  if (msg.service != consts.SERVICE_DISKSHARE && msg.service != consts.SERVICE_ANY) {
    result = {
      status: consts.STATUS_BAD_DEVICE_TYPE,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var share = msg.path.substring(msg.path.lastIndexOf('\\') + 1);

  // todo implement command
  var tid = 99;

  // build response
  msg.header.tid = tid;
  // params
  var out = put();
  out.word8(commandParams.readUInt8(0)) // andX next cmd id
    .word8(0) // andX reserved
    .word16le(commandParams.readUInt16LE(2))  // andX offset (needs to be recalculated by caller!)
    .word16le(SMB_SUPPORT_SEARCH_BITS);  // optionalSupport
  var params = out.buffer();
  // data
  out = put();
  out.put(new Buffer(consts.SERVICE_DISKSHARE, 'ascii')).word8(0)  // service
    .put(new Buffer(NATIVE_FILE_SYSTEM, 'utf16le')).word16le(0);   // nativeFileSystem
  var data = out.buffer();
  // return result
  result = {
    status: consts.STATUS_SUCCESS,
    params: params,
    data: data
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;