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
var _ = require('lodash');

var SMB = require('./constants');
var ntstatus = require('../ntstatus.js');
var utils = require('../utils');

// Size of <code>FIND_FILE_DIRECTORY_INFO</code> (without file name).
var FIND_FILE_DIRECTORY_INFO_SIZE = 64;

// Size of <code>FIND_FILE_NAMES_INFO</code> (without file name).
var FIND_FILE_NAMES_INFO_SIZE = 12;

// Size of <code>FIND_FILE_FULL_DIRECTORY_INFO</code> (without file name).
var FIND_FILE_FULL_DIRECTORY_INFO_SIZE = 68;

// Size of <code>FIND_FILE_BOTH_DIRECTORY_INFO</code> (without file name).
var FIND_FILE_BOTH_DIRECTORY_INFO_SIZE = 94;

var emptyShortNameBytes = new Buffer(2 * 12); // 8.3 unicode
emptyShortNameBytes.fill(0);

/**
 *
 * @param {File[]} files files to be serialized according to the specified information level
 * @param {Number} start
 * @param {Number} end
 * @param {Number} informationLevel
 * @param {Boolean} inclResumeKey
 * @return {Object} result object with status, buffer and lastNameOffset
 */
function serialize(files, start, end, informationLevel, inclResumeKey) {
  var out = put();
  var status = ntstatus.STATUS_SUCCESS;
  var lastNameOffset = 0;

  function process(file, index) {
    var smbCreated = utils.systemToSMBTime(file.getCreatedTime());
    var smbLastModified = utils.systemToSMBTime(file.getLastModifiedTime());
    var smbLastAccessed = utils.systemToSMBTime(file.getLastAccessedTime());
    var smbLastChanged = utils.systemToSMBTime(file.getLastChangedTime());

    var fileNameBytes = new Buffer(file.getName(), 'utf16le');

    switch (informationLevel) {
      case SMB.FIND_INFO_STANDARD:
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
      case SMB.FIND_INFO_EA_SIZE:
      /*
       FIND_INFO_EA_SIZE[SearchCount]
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
      case SMB.FIND_INFO_EAS_FROM_LIST:
        /*
         FIND_INFO_EAS_FROM_LIST[SearchCount]
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
        // todo implement missing information levels
        logger.error('encountered unsupported informationLevel %s', SMB.FIND_INFORMATION_LEVEL_TO_STRING[informationLevel]);
        status = ntstatus.STATUS_NOT_IMPLEMENTED;
        return false;

      case SMB.FIND_FILE_DIRECTORY_INFO:
        out.word32le(index === files.length - 1 ? 0 : FIND_FILE_DIRECTORY_INFO_SIZE + fileNameBytes.length); // NextEntryOffset
        if (inclResumeKey) {
          out.word32le(index + start); // ResumeKey
        }
        lastNameOffset = out.length();
        out.word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
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

      case SMB.FIND_FILE_FULL_DIRECTORY_INFO:
        out.word32le(index === files.length - 1 ? 0 : FIND_FILE_FULL_DIRECTORY_INFO_SIZE + fileNameBytes.length); // NextEntryOffset
        if (inclResumeKey) {
          out.word32le(index + start); // ResumeKey
        }
        lastNameOffset = out.length();
        out.word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
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

      case SMB.FIND_FILE_NAMES_INFO:
        out.word32le(index === files.length - 1 ? 0 : FIND_FILE_NAMES_INFO_SIZE + fileNameBytes.length); // NextEntryOffset
        if (inclResumeKey) {
          out.word32le(index + start); // ResumeKey
        }
        lastNameOffset = out.length();
        out.word32le(fileNameBytes.length) // FileNameLength
          .put(fileNameBytes);  // FileName
        break;

      case SMB.FIND_FILE_BOTH_DIRECTORY_INFO:
        out.word32le(index === files.length - 1 ? 0 : FIND_FILE_BOTH_DIRECTORY_INFO_SIZE + fileNameBytes.length); // NextEntryOffset
        if (inclResumeKey) {
          out.word32le(index + start); // ResumeKey
        }
        lastNameOffset = out.length();
        out.word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
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
        status = ntstatus.STATUS_OS2_INVALID_LEVEL;
        return false;
    }
  }

  _.forEach(files.slice(start, end), process);

  return { status: status, buffer: out.buffer(), lastNameOffset: lastNameOffset };
}

module.exports.serialize = serialize;