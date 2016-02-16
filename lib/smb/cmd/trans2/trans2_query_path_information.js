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
var async = require('async');

var ntstatus = require('../../../ntstatus');
var SMB = require('../../constants');
var utils = require('../../../utils');

/**
 * TRANS2_QUERY_PATH_INFORMATION (0x0005): This transaction is used to get information
 * about a specific file or directory.
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
  var off = 0;
  var informationLevel = commandParams.readUInt16LE(off);
  off += 2;
  off += 4; // reserved
  off += utils.calculatePadLength(commandParamsOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  var fileName = utils.extractUnicodeBytes(commandParams, off).toString('utf16le');

  logger.debug('[%s] informationLevel: %s, fileName: %s', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.QUERY_PATH_INFORMATION_LEVEL_TO_STRING[informationLevel], fileName);

  var result;

  if (informationLevel !== SMB.QUERY_INFO_STANDARD && !msg.header.flags.pathnames.long.supported) {
    result = {
      status: ntstatus.STATUS_INVALID_PARAMETER,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var tree = server.getTree(msg.header.tid);
  if (!tree) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_TID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  function getFile(callback) {
    tree.open(fileName, callback);
  }

  function buildResult(file, callback) {
    var smbCreated = utils.systemToSMBTime(file.getCreatedTime());
    var smbLastModified = utils.systemToSMBTime(file.getLastModifiedTime());
    var smbLastAccessed = utils.systemToSMBTime(file.getLastAccessedTime());
    var smbLastChanged = utils.systemToSMBTime(file.getLastChangedTime());

    var fileNameBytes = new Buffer(fileName, 'utf16le');

    var params = informationLevel >= SMB.QUERY_FILE_BASIC_INFO ? new Buffer([ 0x00, 0x00 ]) : utils.EMPTY_BUFFER;

    var result;
    var dataOut = put();
    switch (informationLevel) {
      case SMB.QUERY_INFO_STANDARD:
      case SMB.QUERY_INFO_QUERY_EA_SIZE:
      case SMB.QUERY_INFO_QUERY_EAS_FROM_LIST:
      case SMB.QUERY_QUERY_ALL_EAS:
      case SMB.QUERY_IS_NAME_VALID:
        // todo implement
        logger.error('encountered unsupported informationLevel %s', SMB.QUERY_PATH_INFORMATION_LEVEL_TO_STRING[informationLevel]);
        result = {
          status: ntstatus.STATUS_NOT_IMPLEMENTED,
          params: commandParams,
          data: commandData
        };
        callback(null, file, result);
        return;

      case SMB.QUERY_FILE_ALL_INFO:
      case SMB.QUERY_FILE_BASIC_INFO:
        dataOut.word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
          .word32le(smbCreated.getHighBitsUnsigned())
          .word32le(smbLastAccessed.getLowBitsUnsigned()) // LastAccessTime
          .word32le(smbLastAccessed.getHighBitsUnsigned())
          .word32le(smbLastModified.getLowBitsUnsigned()) // LastWriteTime
          .word32le(smbLastModified.getHighBitsUnsigned())
          .word32le(smbLastChanged.getLowBitsUnsigned()) // LastChangeTime
          .word32le(smbLastChanged.getHighBitsUnsigned())
          .word32le(file.getAttributes()) // ExtFileAttributes
          .word32le(0); // Reserved
        if (informationLevel !== SMB.QUERY_FILE_ALL_INFO) {
          break;
        }
        // fall through
      case SMB.QUERY_FILE_STANDARD_INFO:
        dataOut.word64le(file.getAllocationSize()) //  AllocationSize
          .word64le(file.getDataSize()) //  EndOfFile
          .word32le(1) // NumberOfLinks
          .word8(0)  // DeletePending
          .word8(file.isDirectory() ? 1 : 0);  // Directory
        if (informationLevel !== SMB.QUERY_FILE_ALL_INFO) {
          break;
        }
        dataOut.word16le(0);  // Reserved2
        // fall through
      case SMB.QUERY_FILE_EA_INFO:
        dataOut.word32le(0);  // EaSize
        if (informationLevel !== SMB.QUERY_FILE_ALL_INFO) {
          break;
        }
        // fall through
      case SMB.QUERY_FILE_NAME_INFO:
        dataOut.word32le(fileNameBytes.length)  // FileNameLength
          .put(fileNameBytes);  // FileName
        break;

      case SMB.QUERY_FILE_STREAM_INFO:
      case SMB.QUERY_FILE_ALT_NAME_INFO:
      case SMB.QUERY_FILE_COMPRESSION_INFO:
        // todo implement
        logger.error('encountered unsupported command 0x%s', informationLevel.toString(16));
        result = {
          status: ntstatus.STATUS_NOT_IMPLEMENTED,
          params: commandParams,
          data: commandData
        };
        callback(null, file, result);
        return;

      default:
        result = {
          status: ntstatus.STATUS_OS2_INVALID_LEVEL,
          params: commandParams,
          data: commandData
        };
        callback(null, file, result);
        return;
    }
    var data = dataOut.buffer();
    result = {
       status: ntstatus.STATUS_SUCCESS,
       params: params,
       data: data
     };
    callback(null, file, result);
  }

  function closeFile(file, result, callback) {
    tree.closeFile(file.getId(), function (ignored) {
      callback(null, result);
    });
  }

  async.waterfall([ getFile, buildResult, closeFile ], function (err, result) {
    if (err) {
      logger.error('[%s] informationLevel: %s, fileName: %s failed', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.QUERY_PATH_INFORMATION_LEVEL_TO_STRING[informationLevel], fileName, err);
      logger.error(err);
      cb({
        status: err.status || ntstatus.STATUS_UNSUCCESSFUL,
        params: commandParams,
        data: commandData
      });
    } else {
      cb(result);
    }
  });
}

module.exports = handle;
