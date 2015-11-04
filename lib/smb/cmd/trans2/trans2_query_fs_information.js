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

var consts = require('../../../constants');
var utils = require('../../../utils');

var DEFAULT_SERIAL_NUMBER = 0xdabbad00;
// Maximum length of each file name component, in number of bytes.
var MAX_FILE_NAME_LENGTH = 255;
// File system. Returning values other than this may lead to problems.
var FILE_SYSTEM = 'NTFS';

// fake values for disk total/free size
var SECTORS_PER_UNIT = 8;
var BYTES_PER_SECTOR = 512;
var TOTAL_ALLOCATION_UNITS = 0x08000000;  // * SECTORS_PER_UNIT * BYTES_PER_SECTOR = 512gb

/**
 * TRANS2_QUERY_FS_INFORMATION (0x0003): This transaction is used to request information
 * about the object store underlying a share on the server.
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
  var informationLevel = commandParams.readUInt16LE(0);

  logger.debug('[%s] informationLevel: %s', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), consts.QUERY_FS_INFORMATION_LEVEL_TO_STRING[informationLevel]);

  var tree = server.getTree(msg.header.tid);
  if (!tree) {
    result = {
      status: consts.STATUS_SMB_BAD_TID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var share = tree.getShare();
  var volumeLabel = share.getDescription();

  var result;

  var dataOut = put();
  // todo expose/retrieve these values through Share abstraction
  switch (informationLevel) {
    case consts.QUERY_FS_INFO_ALLOCATION:
      dataOut.word32le(0) // idFileSystem
        .word32le(SECTORS_PER_UNIT) // cSectorUnit
        .word32le(TOTAL_ALLOCATION_UNITS) // cUnit
        .word32le(TOTAL_ALLOCATION_UNITS) // cUnitAvailable
        .word16le(BYTES_PER_SECTOR); // cbSector
      break;
    case consts.QUERY_FS_INFO_VOLUME:
      dataOut.word32le(DEFAULT_SERIAL_NUMBER) // ulVolSerialNbr
        .word8(volumeLabel.length()) // cCharCount
        .put(new Buffer(volumeLabel, 'utf16le'));  // VolumeLabel
      break;
    case consts.QUERY_FS_VOLUME_INFO:
      var long = utils.systemToSMBTime(Date.now());
      dataOut.word32le(long.getLowBitsUnsigned()) // VolumeCreationTime
        .word32le(long.getHighBitsUnsigned())
        .word32le(DEFAULT_SERIAL_NUMBER) // SerialNumber
        .word32le(volumeLabel.length() * 2)  // VolumeLabelSize
        .word16le(0)  // reserved
        .put(new Buffer(volumeLabel, 'utf16le'));  // VolumeLabel
      break;
    case consts.QUERY_FS_SIZE_INFO:
      //dataOut.word64le(consts.MAX_SAFE_INTEGER) // TotalAllocationUnits
        //.word64le(consts.MAX_SAFE_INTEGER) // TotalFreeAllocationUnits
      dataOut.word64le(TOTAL_ALLOCATION_UNITS) // TotalAllocationUnits
        .word64le(TOTAL_ALLOCATION_UNITS) // TotalFreeAllocationUnits
        .word32le(SECTORS_PER_UNIT) // SectorsPerAllocationUnit
        .word32le(BYTES_PER_SECTOR); // BytesPerSector
      break;
    case consts.QUERY_FS_DEVICE_INFO:
      dataOut.word32le(consts.FILE_DEVICE_DISK) // DeviceType
        .word32le(consts.FILE_VIRTUAL_VOLUME); // DeviceCharacteristics
      break;
    case consts.QUERY_FS_ATTRIBUTE_INFO:
      dataOut.word32le(consts.FILE_CASE_SENSITIVE_SEARCH | consts.FILE_CASE_PRESERVED_NAMES) // FileSystemAttributes
        .word32le(MAX_FILE_NAME_LENGTH)  // MaxFileNameLengthInBytes
        .word32le(FILE_SYSTEM.length * 2)  // LengthOfFileSystemName
        .put(new Buffer(FILE_SYSTEM, 'utf16le'));  // FileSystemName
      break;
    default:
      result = {
        status: consts.STATUS_OS2_INVALID_LEVEL,
        params: commandParams,
        data: commandData
      };
      process.nextTick(function () { cb(result); });
      return;
  }
  var data = dataOut.buffer();

  result = {
    status: consts.STATUS_SUCCESS,
    params: utils.EMPTY_BUFFER,
    data: data
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;