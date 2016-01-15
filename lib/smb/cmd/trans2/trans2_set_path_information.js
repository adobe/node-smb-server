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
var logger = require('winston').loggers.get('smb');
var Long = require('long');
var async = require('async');

var ntstatus = require('../../../ntstatus');
var consts = require('../../../constants');
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

  logger.debug('[%s] informationLevel: %s, fileName: %s', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel], fileName);

  var result;

  if (informationLevel !== consts.SET_INFO_STANDARD && !msg.header.flags.pathnames.long.supported) {
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

  function processFile(file, callback) {
    switch (informationLevel) {
      case consts.SET_INFO_STANDARD:
      /*
       SMB_INFO_STANDARD
       {
       SMB_DATE CreationDate;
       SMB_TIME CreationTime;
       SMB_DATE LastAccessDate;
       SMB_TIME LastAccessTime;
       SMB_DATE LastWriteDate;
       SMB_TIME LastWriteTime;
       UCHAR    Reserved[10];
       }
       */
      case consts.SET_INFO_EAS:
        /*
         SMB_INFO_SET_EAS
         {
         SMB_FEA_LIST ExtendedAttributeList;
         }
         */
        // todo implement
        logger.error('encountered unsupported informationLevel %s', consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel]);
        result = {
          status: ntstatus.STATUS_NOT_IMPLEMENTED,
          params: commandParams,
          data: commandData
        };
        callback(null, file, result);
        return;

      case consts.SET_FILE_BASIC_INFO:
      case consts.SET_FILE_BASIC_INFORMATION:
        // CIFS spec: SET_FILE_BASIC_INFO is not supported for TRANS2_SET_PATH_INFORMATION...
        // on OS-X the timestamp value is sometimes -2082844800000 (1904-01-01T00:00:00.000Z) which is the epoch used by GetDateTime() ... ?!
        off = 0;
        var creationTimeMs = utils.readTimestamp(commandData, off);
        off += 8;
        var lastAccessTimeMs = utils.readTimestamp(commandData, off);
        off += 8;
        var lastWriteTimeMs = utils.readTimestamp(commandData, off);
        off += 8;
        var changeTimeMs = utils.readTimestamp(commandData, off);
        off += 8;
        var extFileAttributes = commandData.readUInt32LE(off);
        off += 4;
        // todo implement according to https://msdn.microsoft.com/en-us/library/ff469851.aspx
        if (creationTimeMs && creationTimeMs !== -1) {
          // set created
        }
        if (lastAccessTimeMs && lastAccessTimeMs !== -1) {
          // set lastAccessed
        }
        if (lastWriteTimeMs && lastWriteTimeMs !== -1) {
          // set lastModified
        }
        if (changeTimeMs && changeTimeMs !== -1) {
          // set changed
        }

        logger.debug('[%s] informationLevel: %s, fileName: %s, creationTime: %d, lastAccessTime: %d, lastWriteTime: %d, changeTime: %d, extFileAttributes: %s', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel] || '0x' + informationLevel.toString(16), fileName, creationTimeMs, lastAccessTimeMs, lastWriteTimeMs, changeTimeMs, extFileAttributes.toString(2));

        result = {
          status: ntstatus.STATUS_SUCCESS,
          params: new Buffer([ 0x0, 0x0 ]),  // EaErrorOffset
          data: utils.EMPTY_BUFFER
        };
        callback(null, file, result);
        return;

      default:
        logger.error('[%s] encountered unsupported or unknown informationLevel %s, fileName: %s', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel] || '0x' + informationLevel.toString(16), fileName);
        result = {
          status: ntstatus.STATUS_OS2_INVALID_LEVEL,
          params: commandParams,
          data: commandData
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
      logger.error('[%s] informationLevel: %s, fileName: %s failed', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel], fileName, err);
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
