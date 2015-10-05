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
var async = require('async');

var consts = require('../../../constants');
var utils = require('../../../utils');

// Size of <code>SMB_FIND_FILE_DIRECTORY_INFO</code> (without file name).
var FIND_FILE_DIRECTORY_INFO_SIZE = 64;

// Size of <code>SMB_FIND_FILE_NAMES_INFO</code> (without file name).
var FIND_FILE_NAMES_INFO_SIZE = 12;

// Size of <code>SMB_FIND_FILE_FULL_DIRECTORY_INFO</code> (without file name).
var FIND_FILE_FULL_DIRECTORY_INFO_SIZE = 68;

// Size of <code>SMB_FIND_FILE_BOTH_DIRECTORY_INFO</code> (without file name).
var FIND_FILE_BOTH_DIRECTORY_INFO_SIZE = 94;

var emptyShortNameBytes = new Buffer(2 * 12); // 8.3 unicode

/**
 * TRANS2_FIND_FIRST2 (0x0001): This transaction is used to begin a search for file(s)
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
  var searchAttributes = commandParams.readUInt16LE(off);
  off += 2;
  var searchCount = commandParams.readUInt16LE(off);
  off += 2;
  var flags = commandParams.readUInt16LE(off);
  off += 2;
  var informationLevel = commandParams.readUInt16LE(off);
  off += 2;
  var searchStorageType = commandParams.readUInt32LE(off);
  off += 4;
  var bytes = utils.extractUnicodeBytes(commandParams, off);
  off += bytes.length;
  var fileName = bytes.toString('utf16le');

  logger.debug('[%s] searchAttributes: %s, searchCount: %d, flags: %s, informationLevel: 0x%s, searchStorageType: %d, fileName: %s', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId], searchAttributes.toString(2), searchCount, flags.toString(2), informationLevel.toString(16), searchStorageType, fileName);

  // todo evaluate/handle searchAttributes, searchCount and flags according to the CIFS spec

  var self = this;

  function lookup(callback) {
    server.getTree(msg.header.tid).list(fileName, callback);
  }

  function processLookupResult(files, callback) {
    var dataOut = put();

    function process(file, index) {
      var smbCreated = utils.systemToSMBTime(file.getCreatedTime());
      var smbLastModified = utils.systemToSMBTime(file.getLastModifiedTime());
      var smbLastAccessed = utils.systemToSMBTime(file.getLastAccessedTime());
      var smbLastChanged = utils.systemToSMBTime(file.getLastChangedTime());

      var fileNameBytes = new Buffer(file.getName(), 'utf16le');

      switch (informationLevel) {
        case consts.SMB_INFO_STANDARD:
          /*
           SMB_INFO_STANDARD[SearchCount]
           {
           ULONG               ResumeKey (optional);
           SMB_DATE            CreationDate;
           SMB_TIME            CreationTime;
           SMB_DATE            LastAccessDate;
           SMB_TIME            LastAccessTime;
           SMB_DATE            LastWriteDate;
           SMB_TIME            LastWriteTime;
           ULONG               FileDataSize;
           ULONG               AllocationSize;
           SMB_FILE_ATTRIBUTES Attributes;
           UCHAR               FileNameLength;
           SMB_STRING          FileName;
           }
           */
        case consts.SMB_INFO_QUERY_EA_SIZE:
          /*
           SMB_INFO_QUERY_EA_SIZE[SearchCount]
           {
           ULONG               ResumeKey (optional);
           SMB_DATE            CreationDate;
           SMB_TIME            CreationTime;
           SMB_DATE            LastAccessDate;
           SMB_TIME            LastAccessTime;
           SMB_DATE            LastWriteDate;
           SMB_TIME            LastWriteTime;
           ULONG               FileDataSize;
           ULONG               AllocationSize;
           SMB_FILE_ATTRIBUTES Attributes;
           ULONG               EaSize;
           UCHAR               FileNameLength;
           UCHAR               FileName[];
           }
           */
        case consts.SMB_INFO_QUERY_EAS_FROM_LIST:
          /*
           SMB_INFO_QUERY_EAS_FROM_LIST[SearchCount]
           {
           ULONG               ResumeKey (optional);
           SMB_DATE            CreationDate;
           SMB_TIME            CreationTime;
           SMB_DATE            LastAccessDate;
           SMB_TIME            LastAccessTime;
           SMB_DATE            LastWriteDate;
           SMB_TIME            LastWriteTime;
           ULONG               FileDataSize;
           ULONG               AllocationSize;
           SMB_FILE_ATTRIBUTES Attributes;
           SMB_FEA_LIST        ExtendedAttributeList;
           UCHAR               FileNameLength;
           UCHAR               FileName[];
           }
           */
          // todo implement
          logger.error('encountered unsupported informationLevel 0x%s', informationLevel.toString(16));
          callback(null, {
            status: consts.STATUS_NOT_IMPLEMENTED,
            params: commandParams,
            data: commandData
          });
          return;

        case consts.SMB_FIND_FILE_DIRECTORY_INFO:
          dataOut.word32le(index === files.length - 1 ? 0 : FIND_FILE_DIRECTORY_INFO_SIZE + fileNameBytes.length) // NextEntryOffset
            .word32le(index + 1) // FileIndex
            .word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
            .word32le(smbCreated.getHighBitsUnsigned())
            .word32le(smbLastAccessed.getLowBitsUnsigned()) // LastAccessTime
            .word32le(smbLastAccessed.getHighBitsUnsigned())
            .word32le(smbLastModified.getLowBitsUnsigned()) // LastWriteTime
            .word32le(smbLastModified.getHighBitsUnsigned())
            .word32le(smbLastChanged.getLowBitsUnsigned()) // LastChangeTime
            .word32le(smbLastChanged.getHighBitsUnsigned())
            .word64le(file.getDataSize()) // EndOfFile
            .word64le(file.getAllocationSize()) // AllocationSize
            .word32le(file.getAttributes()) // ExtFileAttributes
            .word32le(fileNameBytes.length) // FileNameLength
            .put(fileNameBytes); // FileName
          break;

        case consts.SMB_FIND_FILE_FULL_DIRECTORY_INFO:
          dataOut.word32le(index === files.length - 1 ? 0 : FIND_FILE_FULL_DIRECTORY_INFO_SIZE + fileNameBytes.length) // NextEntryOffset
            .word32le(index + 1) // FileIndex
            .word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
            .word32le(smbCreated.getHighBitsUnsigned())
            .word32le(smbLastAccessed.getLowBitsUnsigned()) // LastAccessTime
            .word32le(smbLastAccessed.getHighBitsUnsigned())
            .word32le(smbLastModified.getLowBitsUnsigned()) // LastWriteTime
            .word32le(smbLastModified.getHighBitsUnsigned())
            .word32le(smbLastChanged.getLowBitsUnsigned()) // LastChangeTime
            .word32le(smbLastChanged.getHighBitsUnsigned())
            .word64le(file.getDataSize()) // EndOfFile
            .word64le(file.getAllocationSize()) // AllocationSize
            .word32le(file.getAttributes()) // ExtFileAttributes
            .word32le(fileNameBytes.length) // FileNameLength
            .word32le(0)  // EaSize
            .put(fileNameBytes); // FileName
          break;

        case consts.SMB_FIND_FILE_NAMES_INFO:
          dataOut.word32le(index === files.length - 1 ? 0 : FIND_FILE_NAMES_INFO_SIZE + fileNameBytes.length) // NextEntryOffset
            .word32le(index + 1) // FileIndex
            .word32le(fileNameBytes.length) // FileNameLength
            .put(fileNameBytes);  // FileName
          break;

        case consts.SMB_FIND_FILE_BOTH_DIRECTORY_INFO:
          dataOut.word32le(index === files.length - 1 ? 0 : FIND_FILE_BOTH_DIRECTORY_INFO_SIZE + fileNameBytes.length) // NextEntryOffset
            .word32le(index + 1) // FileIndex
            .word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
            .word32le(smbCreated.getHighBitsUnsigned())
            .word32le(smbLastAccessed.getLowBitsUnsigned()) // LastAccessTime
            .word32le(smbLastAccessed.getHighBitsUnsigned())
            .word32le(smbLastModified.getLowBitsUnsigned()) // LastWriteTime
            .word32le(smbLastModified.getHighBitsUnsigned())
            .word32le(smbLastChanged.getLowBitsUnsigned()) // LastChangeTime
            .word32le(smbLastChanged.getHighBitsUnsigned())
            .word64le(file.getDataSize()) // EndOfFile
            .word64le(file.getAllocationSize()) // AllocationSize
            .word32le(file.getAttributes()) // ExtFileAttributes
            .word32le(fileNameBytes.length) // FileNameLength
            .word32le(0)  // EaSize
            .word8(0) // ShortNameLength
            .word8(0) // Reserved
            .put(emptyShortNameBytes)  // ShortName
            .put(fileNameBytes); // FileName
          break;

        default:
          callback(null, {
            status: consts.STATUS_OS2_INVALID_LEVEL,
            params: commandParams,
            data: commandData
          });
          return;
      }
    }

    if (!files.length) {
      callback(null, {
        status: consts.STATUS_NO_SUCH_FILE,
        params: commandParams,
        data: commandData
      });
      return;
    }

    files.forEach(process);

    // build params
    var paramsOut = put();
    paramsOut.word16le(0) // SID
      .word16le(files.length) // SearchCount
      .word16le(1)  // EndOfSearch
      .word16le(0)  // EaErrorOffset
      .word16le(0);  // LastNameOffset

    var params = paramsOut.buffer();
    var data = dataOut.buffer();
    var result = {
      status: consts.STATUS_SUCCESS,
      params: params,
      data: data
    };
    callback(null, result);
  }

  async.waterfall([ lookup, processLookupResult ], function (err, result) {
    if (err) {
      logger.error(err);
      cb({
        status: consts.STATUS_UNSUCCESSFUL,
        params: commandParams,
        data: commandData
      });
    } else {
      cb(result);
    }
  });
}

module.exports = handle;