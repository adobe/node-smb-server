/*
 *  Copyright 2015 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

'use strict';

var put = require('put');
var logger = require('winston').loggers.get('smb');

var ntstatus = require('../../../ntstatus');
var SMB = require('../../constants');
var infoLevel = require('../../informationLevel');
var utils = require('../../../utils');

/**
 * TRANS2_FIND_NEXT2 (0x0002): This transaction is used to begin a search for file(s)
 * within a directory or for a directory.
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
  var off = 0;
  var sid = commandParams.readUInt16LE(off);
  off += 2;
  var searchCount = commandParams.readUInt16LE(off);
  off += 2;
  var informationLevel = commandParams.readUInt16LE(off);
  off += 2;
  var resumeKey = commandParams.readUInt32LE(off);
  off += 4;
  var flags = commandParams.readUInt16LE(off);
  off += 2;
  off += utils.calculatePadLength(commandParamsOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  var bytes = utils.extractUnicodeBytes(commandParams, off);
  off += bytes.length + 2;
  var fileName = bytes.toString('utf16le');

  var includeResumeKey = !!(flags & SMB.FIND_RETURN_RESUME_KEYS);

  var session = server.getSession(msg.header.uid);
  if (!session) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_UID,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var search = session.getSearch(sid);
  if (!search) {
    result = {
      status: ntstatus.STATUS_INVALID_HANDLE,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  logger.debug('[%s] SID: %d, searchCount: %d, informationLevel: %s, resumeKey: %d, flags: %s, fileName: %s', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), sid, searchCount, SMB.FIND_INFORMATION_LEVEL_TO_STRING[informationLevel], resumeKey, flags.toString(2), fileName);

  // todo evaluate/handle searchAttributes according to the CIFS spec

  var result;
  var endOfSearch = 1;

  var files = search.results;

  var count = files.length - resumeKey;
  if (count <= 0) {
    cb({
      status: ntstatus.STATUS_NO_SUCH_FILE,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    });
    return;
  }

  if (count > searchCount) {
    count = searchCount;
    endOfSearch = 0;
  }

  var serializeResult = infoLevel.serialize(files, resumeKey, resumeKey + count, informationLevel, includeResumeKey);
  if (serializeResult.status) {
    cb({
      status: serializeResult.status,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    });
    return;
  }

  // build params
  var paramsOut = put();
  paramsOut.word16le(count) // SearchCount
    .word16le(endOfSearch)  // EndOfSearch
    .word16le(0)  // EaErrorOffset
    .word16le(serializeResult.lastNameOffset);  // LastNameOffset

  var params = paramsOut.buffer();
  var data = serializeResult.buffer;
  cb({
    status: ntstatus.STATUS_SUCCESS,
    params: params,
    data: data
  });
  if (flags & SMB.FIND_CLOSE_AFTER_REQUEST) {
    session.closeSearch(sid);
  }
  if (endOfSearch && (flags & SMB.FIND_CLOSE_AT_EOS)) {
    session.closeSearch(sid);
  }
}

module.exports = handle;