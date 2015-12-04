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

var Path = require('path');

var put = require('put');
var logger = require('winston').loggers.get('smb');
var Long = require('long');

var consts = require('../../../constants');
var utils = require('../../../utils');

/**
 * TRANS2_SET_FILE_INFORMATION (0x0008): This transaction is an alternative to TRANS2_SET_PATH_INFORMATION.
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
  var fid = commandParams.readUInt16LE(0);
  var informationLevel = commandParams.readUInt16LE(2);

  var tree = server.getTree(msg.header.tid);
  var fileName = tree && tree.getFile(fid) && tree.getFile(fid).getName() || null;

  logger.debug('[%s] informationLevel: %s, fid: %d [fileName: %s]', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel], fid, fileName);

  var result;

  if (informationLevel !== consts.SET_INFO_STANDARD && !msg.header.flags.pathnames.long.supported) {
    result = {
      status: consts.STATUS_INVALID_PARAMETER,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  if (!tree) {
    result = {
      status: consts.STATUS_SMB_BAD_TID,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var off;
  var file = tree.getFile(fid);
  if (!file) {
    result = {
      status: consts.STATUS_SMB_BAD_FID,
      params: utils.EMPTY_BUFFER,
      data: utils.EMPTY_BUFFER
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  switch (informationLevel) {
    case consts.SET_INFO_STANDARD:
    case consts.SET_INFO_EAS:
    case consts.SET_FILE_ALLOCATION_INFO:
      // todo implement
      logger.error('encountered unsupported informationLevel %s', consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel]);
      result = {
        status: consts.STATUS_NOT_IMPLEMENTED,
        params: utils.EMPTY_BUFFER,
        data: utils.EMPTY_BUFFER
      };
      process.nextTick(function () { cb(result); });
      return;

    case consts.SET_FILE_BASIC_INFO:
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

      logger.debug('[%s] informationLevel: %s, fid: %d [fileName: %s], creationTime: %d, lastAccessTime: %d, lastWriteTime: %d, changeTime: %d, extFileAttributes: %s', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel], fid, fileName, creationTimeMs, lastAccessTimeMs, lastWriteTimeMs, changeTimeMs, extFileAttributes.toString(2));

      result = {
        status: consts.STATUS_SUCCESS,
        params: new Buffer([ 0x0, 0x0 ]),  // EaErrorOffset
        data: utils.EMPTY_BUFFER
      };
      cb(result);
      return;

    case consts.SET_FILE_DISPOSITION_INFO:
      var deletePending = !!commandData.readUInt8(0);
      if (deletePending) {
        file.delete(function (err) {
          if (err) {
            logger.error(err);
            result = {
              status: err.status || consts.STATUS_UNSUCCESSFUL,
              params: utils.EMPTY_BUFFER,
              data: utils.EMPTY_BUFFER
            };
          } else {
            result = {
              status: consts.STATUS_SUCCESS,
              params: new Buffer([ 0x0, 0x0 ]),  // EaErrorOffset
              data: utils.EMPTY_BUFFER
            };
          }
          cb(result);
        });

      }
      return;

    case consts.SET_FILE_END_OF_FILE_INFO:
    case consts.SET_FILE_END_OF_FILE_INFORMATION:
      var endOfFile = Long.fromBits(commandData.readUInt32LE(0), commandData.readUInt32LE(4), true).toNumber();
      file.setLength(endOfFile, function (err) {
        if (err) {
          logger.error(err);
          result = {
            status: err.status || consts.STATUS_UNSUCCESSFUL,
            params: utils.EMPTY_BUFFER,
            data: utils.EMPTY_BUFFER
          };
        } else {
          result = {
            status: consts.STATUS_SUCCESS,
            params: new Buffer([ 0x0, 0x0 ]),  // EaErrorOffset
            data: utils.EMPTY_BUFFER
          };
        }
        cb(result);
      });
      return;

    case consts.SET_FILE_RENAME_INFORMATION:
      var replace = commandData.readUInt32LE(0);
      var rootDirectoryHandle = commandData.readUInt32LE(4);
      var targetNameLength = commandData.readUInt32LE(8);
      var bytes = utils.extractUnicodeBytes(commandData, 12);
      var targetName = bytes.toString('utf16le');
      var targetPath = Path.join(utils.getParentPath(file.getPath()), targetName);
      tree.rename(file.getPath(), targetPath, function (err) {
        if (!err) {
          // update file instance
          file.onFileNameChanged(targetName);
        }
        cb({
          status: err ? err.status || consts.STATUS_UNSUCCESSFUL : consts.STATUS_SUCCESS,
          params: utils.EMPTY_BUFFER,
          data: utils.EMPTY_BUFFER
        });
      });
      return;

    case consts.SET_FILE_DISPOSITION_INFORMATION:
      var flags = commandData.readUInt8(0);
      if (flags & 0x01) {
        file.setDeleteOnClose();
      }
      result = {
        status: consts.STATUS_SUCCESS,
        params: new Buffer([ 0x0, 0x0 ]),  // EaErrorOffset
        data: utils.EMPTY_BUFFER
      };
      process.nextTick(function () { cb(result); });
      return;

    default:
      logger.error('encountered unsupported or unknown informationLevel %s, fid: %d [fileName: %s]', consts.SET_INFORMATION_LEVEL_TO_STRING[informationLevel] || '0x' + informationLevel.toString(16), fid, fileName);
      result = {
        status: consts.STATUS_OS2_INVALID_LEVEL,
        params: utils.EMPTY_BUFFER,
        data: utils.EMPTY_BUFFER
      };
      process.nextTick(function () { cb(result); });
      return;
  }
}
module.exports = handle;
