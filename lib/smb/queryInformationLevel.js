/*
 *  Copyright 2016 Adobe Systems Incorporated. All rights reserved.
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

var SMB = require('./constants');
var ntstatus = require('../ntstatus.js');
var utils = require('../utils');

/**
 *
 * @param {File} file file to be serialized according to the specified information level
 * @param {Number} informationLevel
 * @return {Object} result object with status, buffer and lastNameOffset
 */
function serialize(file, informationLevel) {
  var out = put();
  var status = ntstatus.STATUS_SUCCESS;

  var smbCreated = utils.systemToSMBTime(file.getCreatedTime());
  var smbLastModified = utils.systemToSMBTime(file.getLastModifiedTime());
  var smbLastAccessed = utils.systemToSMBTime(file.getLastAccessedTime());
  var smbLastChanged = utils.systemToSMBTime(file.getLastChangedTime());

  var fileNameBytes = Buffer.from(file.getName(), 'utf16le');
  var STREAM_NAME_BYTES = Buffer.from('::$DATA', 'utf16le');

  switch (informationLevel) {
    case SMB.QUERY_INFO_STANDARD:
    case SMB.QUERY_INFO_QUERY_EA_SIZE:
    case SMB.QUERY_INFO_QUERY_EAS_FROM_LIST:
    case SMB.QUERY_QUERY_ALL_EAS:
    case SMB.QUERY_IS_NAME_VALID:
    case SMB.QUERY_FILE_STREAM_INFO:
    case SMB.QUERY_FILE_ALT_NAME_INFO:
    case SMB.QUERY_FILE_COMPRESSION_INFO:
      // todo implement remaining informationLevels
      logger.error('encountered unsupported informationLevel %s', SMB.QUERY_INFORMATION_LEVEL_TO_STRING[informationLevel]);
      status = ntstatus.STATUS_NOT_IMPLEMENTED;
      break;

    case SMB.QUERY_FILE_ALL_INFO:
    case SMB.QUERY_FILE_BASIC_INFO:
      out.word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
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
      out.word64le(file.getAllocationSize()) // AllocationSize
        .word64le(file.getDataSize()) // EndOfFile
        .word32le(1) // NumberOfLinks
        .word8(0)  // DeletePending
        .word8(file.isDirectory() ? 1 : 0);  // Directory
      if (informationLevel !== SMB.QUERY_FILE_ALL_INFO) {
        break;
      }
      out.word16le(0);  // Reserved2
    // fall through
    case SMB.QUERY_FILE_EA_INFO:
      out.word32le(0);  // EaSize
      if (informationLevel !== SMB.QUERY_FILE_ALL_INFO) {
        break;
      }
    // fall through
    case SMB.QUERY_FILE_NAME_INFO:
      out.word32le(fileNameBytes.length)  // FileNameLength
        .put(fileNameBytes);  // FileName
      break;

    // NT passthrough levels: SMB.INFO_PASSTHROUGH + native level
    case SMB.FILE_BASIC_INFORMATION:
      out.word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
        .word32le(smbCreated.getHighBitsUnsigned())
        .word32le(smbLastAccessed.getLowBitsUnsigned()) // LastAccessTime
        .word32le(smbLastAccessed.getHighBitsUnsigned())
        .word32le(smbLastModified.getLowBitsUnsigned()) // LastWriteTime
        .word32le(smbLastModified.getHighBitsUnsigned())
        .word32le(smbLastChanged.getLowBitsUnsigned()) // LastChangeTime
        .word32le(smbLastChanged.getHighBitsUnsigned())
        .word32le(file.getAttributes()) // ExtFileAttributes
        .word32le(0); // Reserved
      break;

    case SMB.FILE_STANDARD_INFORMATION:
      out.word64le(file.getAllocationSize()) // AllocationSize
        .word64le(file.getDataSize()) // EndOfFile
        .word32le(1) // NumberOfLinks
        .word8(0)  // DeletePending
        .word8(file.isDirectory() ? 1 : 0)  // Directory
        .word16le(0); // Reserved
      break;

    case SMB.FILE_INTERNAL_INFORMATION:
      // not supported
      out.word64le(0); // IndexNumber
      break;

    case SMB.FILE_STREAM_INFORMATION:
      if (file.isFile()) {
        out.word32le(0) // NextEntryOffset
          .word32le(STREAM_NAME_BYTES.length) // StreamNameLength
          .word64le(file.getDataSize()) // StreamSize
          .word64le(file.getAllocationSize()) // AllocationSize
          .put(STREAM_NAME_BYTES);  // StreamName
      }
      break;

    case SMB.FILE_NETWORK_OPEN_INFORMATION:
      out.word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
        .word32le(smbCreated.getHighBitsUnsigned())
        .word32le(smbLastAccessed.getLowBitsUnsigned()) // LastAccessTime
        .word32le(smbLastAccessed.getHighBitsUnsigned())
        .word32le(smbLastModified.getLowBitsUnsigned()) // LastWriteTime
        .word32le(smbLastModified.getHighBitsUnsigned())
        .word32le(smbLastChanged.getLowBitsUnsigned()) // LastChangeTime
        .word32le(smbLastChanged.getHighBitsUnsigned())
        .word64le(file.getAllocationSize()) // AllocationSize
        .word64le(file.getDataSize()) // EndOfFile
        .word32le(file.getAttributes()) // ExtFileAttributes
        .word32le(0); // Reserved
      break;

    default:
      logger.error('encountered unknown informationLevel 0x%s', informationLevel.toString(16));
      status = ntstatus.STATUS_OS2_INVALID_LEVEL;
  }

  return { status: status, buffer: out.buffer() };
}

module.exports.serialize = serialize;