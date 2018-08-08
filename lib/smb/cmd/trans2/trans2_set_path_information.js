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
 * TRANS2_SET_PATH_INFORMATION (0x0006): This transaction is used to set the standard and
 * extended attribute information of a specific file or directory on the server.
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
  off += 4; // Reserved
  off += utils.calculatePadLength(commandParamsOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  var fileName = utils.extractUnicodeBytes(commandParams, off).toString('utf16le');

  logger.debug('[%s] informationLevel: %s, fileName: %s', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.SET_INFORMATION_LEVEL_TO_STRING[informationLevel], fileName);

  var result;

  if (informationLevel !== SMB.SET_INFO_STANDARD && !msg.header.flags.pathnames.long.supported) {
    result = {
      status: ntstatus.STATUS_INVALID_PARAMETER,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var tree = server.getTree(msg.header.tid);
  if (!tree) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_TID,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  function getFile(callback) {
    tree.open(fileName, callback);
  }

  function processFile(file, callback) {
    var eaErrorOffset = Buffer.from([ 0x00, 0x00 ]);
    var msLastAccess, msCreation, msLastWrite, msChange;

    switch (informationLevel) {
      case SMB.SET_INFO_STANDARD:
        off = 0;
        var smbDate = commandData.readUInt16LE(off);
        off += 2;
        var smbTime = commandData.readUInt16LE(off);
        off += 2;
        msCreation = utils.legacySMBToSystemDateTime(smbDate, smbTime);
        smbDate = commandData.readUInt16LE(off);
        off += 2;
        smbTime = commandData.readUInt16LE(off);
        off += 2;
        msLastAccess = utils.legacySMBToSystemDateTime(smbDate, smbTime);
        smbDate = commandData.readUInt16LE(off);
        off += 2;
        smbTime = commandData.readUInt16LE(off);
        off += 2;
        msLastWrite = utils.legacySMBToSystemDateTime(smbDate, smbTime);
        // set lastModified
        file.setLastModifiedTime(msLastWrite);
        // todo implement according to https://msdn.microsoft.com/en-us/library/ff469956.aspx
        // set created
        // set lastAccessed

        logger.debug('[%s] informationLevel: %s, fileName: %s, creationTime: %d, lastAccessTime: %d, lastWriteTime: %d', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.SET_INFORMATION_LEVEL_TO_STRING[informationLevel] || '0x' + informationLevel.toString(16), fileName, msCreation, msLastAccess, msLastWrite);

        result = {
          status: ntstatus.STATUS_SUCCESS,
          params: eaErrorOffset,  // EaErrorOffset
          data: utils.EMPTY_BUFFER
        };
        callback(null, file, result);
        return;

      case SMB.SET_INFO_EAS:
        var eaList = utils.parseFEAList(commandData, 0);
        if (eaList && eaList.length) {
          // we're currently not supporting EAs
          eaErrorOffset.writeUInt16LE(eaList[0].offset, 0);
        }
        result = {
          status: ntstatus.STATUS_SUCCESS,
          params: eaErrorOffset, // EaErrorOffset
          data: utils.EMPTY_BUFFER
        };
        callback(null, file, result);
        return;

      case SMB.SET_FILE_BASIC_INFO:
      case SMB.FILE_BASIC_INFORMATION:
        // CIFS spec: SET_FILE_BASIC_INFO is not supported for TRANS2_SET_PATH_INFORMATION...
        // on OS-X the timestamp value is sometimes -2082844800000 (1904-01-01T00:00:00.000Z) which is the epoch used by GetDateTime() ... ?!
        off = 0;
        msCreation = utils.readTimestamp(commandData, off);
        off += 8;
        msLastAccess = utils.readTimestamp(commandData, off);
        off += 8;
        msLastWrite = utils.readTimestamp(commandData, off);
        off += 8;
        msChange = utils.readTimestamp(commandData, off);
        off += 8;
        var extFileAttributes = commandData.readUInt32LE(off);
        off += 4;
        // todo implement according to https://msdn.microsoft.com/en-us/library/ff469851.aspx
        if (msCreation && msCreation !== -1) {
          // set created
        }
        if (msLastAccess && msLastAccess !== -1) {
          // set lastAccessed
        }
        if (msLastWrite && msLastWrite !== -1) {
          // set lastModified
          file.setLastModifiedTime(msLastWrite);
        }
        if (msChange && msChange !== -1) {
          // set changed
        }

        logger.debug('[%s] informationLevel: %s, fileName: %s, creationTime: %d, lastAccessTime: %d, lastWriteTime: %d, changeTime: %d, extFileAttributes: %s', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.SET_INFORMATION_LEVEL_TO_STRING[informationLevel] || '0x' + informationLevel.toString(16), fileName, msCreation, msLastAccess, msLastWrite, msChange, extFileAttributes.toString(2));

        result = {
          status: ntstatus.STATUS_SUCCESS,
          params: eaErrorOffset,  // EaErrorOffset
          data: utils.EMPTY_BUFFER
        };
        callback(null, file, result);
        return;

      default:
        logger.error('[%s] encountered unsupported or unknown informationLevel %s, fileName: %s', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.SET_INFORMATION_LEVEL_TO_STRING[informationLevel] || '0x' + informationLevel.toString(16), fileName);
        result = {
          status: ntstatus.STATUS_OS2_INVALID_LEVEL,
          params: utils.EMPTY_BUFFER,
          data: utils.EMPTY_BUFFER
        };
        callback(null, file, result);
        return;
    }
  }

  function closeFile(file, result, callback) {
    tree.closeFile(file.getId(), function (ignored) {
      callback(null, result);
    });
  }

  async.waterfall([ getFile, processFile, closeFile ], function (err, result) {
    if (err) {
      logger.error('[%s] informationLevel: %s, fileName: %s failed', SMB.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), SMB.SET_INFORMATION_LEVEL_TO_STRING[informationLevel], fileName, err);
      cb({
        status: err.status || ntstatus.STATUS_UNSUCCESSFUL,
        params: utils.EMPTY_BUFFER,
        data: utils.EMPTY_BUFFER
      });
    } else {
      cb(result);
    }
  });
}

module.exports = handle;
