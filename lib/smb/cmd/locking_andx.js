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
var _ = require('lodash');

var consts = require('../../constants');
var utils = require('../../utils');

/**
 * SMB_COM_LOCKING_ANDX (0x24): This command is used to explicitly lock and/or
 * unlock a contiguous range of bytes in a regular file.
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
  // decode params
  var parser = binary.parse(commandParams);
  var paramsObj = parser.skip(4) // skip andX header
    .word16le('fid')
    .word8('typeOfLock')
    .word8('newOpLockLevel')
    .word32le('timeout')
    .word16le('numberOfRequestedUnlocks')
    .word16le('numberOfRequestedLocks')
    .vars;
  _.assign(msg, paramsObj);

  // decode data
  var off = 0;
  var unlocksBuf = commandData.slice(off, off + 20 * msg.numberOfRequestedUnlocks);
  off += msg.numberOfRequestedUnlocks;
  var locksBuf = commandData.slice(off, off + 20 * msg.numberOfRequestedLocks);
  off += 20 * msg.numberOfRequestedLocks;

  msg.locks = [];
  msg.unlocks = [];

  var i;
  parser = binary.parse(unlocksBuf);
  for (i = 0; i < msg.numberOfRequestedUnlocks; i++) {
    msg.unlocks.push(parser.word16le('pid')
      .skip(1)
      .word32le('byteOffsetHigh')
      .word32le('byteOffsetLow')
      .word32le('lengthInBytesHigh')
      .word32le('lengthInBytesLow')
      .vars);
  }
  parser = binary.parse(locksBuf);
  for (i = 0; i < msg.numberOfRequestedLocks; i++) {
    msg.locks.push(parser.word16le('pid')
      .skip(2)
      .word32le('byteOffsetHigh')
      .word32le('byteOffsetLow')
      .word32le('lengthInBytesHigh')
      .word32le('lengthInBytesLow')
      .vars);
  }

  logger.debug('[%s] fid: %d, typeOfLock: %s, newOpLockLevel: %d, timeout: 0x%s, numberOfRequestedUnlocks: %d, numberOfRequestedLocks: %d', consts.COMMAND_TO_STRING[commandId], msg.fid, msg.typeOfLock.toString(2), msg.newOpLockLevel, msg.timeout.toString(16), msg.numberOfRequestedUnlocks, msg.numberOfRequestedLocks);

  // todo implement locking

  // build result
  var result;

  // params
  var out = put();
  out.word8(commandParams.readUInt8(0)) // andX next cmd id
    .word8(0) // andX reserved
    .word16le(commandParams.readUInt16LE(2));  // andX offset (needs to be recalculated by caller!)
  var params = out.buffer();

  // return result
  result = {
    status: consts.STATUS_SUCCESS,
    params: params,
    data: utils.EMPTY_BUFFER
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;