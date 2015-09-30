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

var consts = require('../../../constants');
var utils = require('../../../utils');

/**
 * TRANS2_QUERY_PATH_INFORMATION (0x0005): This transaction is used to get information
 * about a specific file or directory.
 *
 * @param {Object} msg - an SMB message object
 * @param {Number} commandId - the command id
 * @param {Buffer} commandParams - the command parameters
 * @param {Buffer} commandData - the command data
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
function handle(msg, commandId, commandParams, commandData, connection, server, cb) {
  var informationLevel = commandParams.readUInt16LE(0);
  var fileName = utils.extractUnicodeBytes(commandParams, 6).toString('utf16le');

  logger.debug('[%s] informationLevel: 0x%s, fileName: %s', consts.TRANS2_SUBCOMMAND_TO_STRING[commandId], informationLevel.toString(16), fileName);

  // todo implement

  var share = server.getTree(msg.header.tid).getShare();

  var result;

  if (informationLevel != consts.SMB_INFO_STANDARD && !msg.header.flags.pathnames.long.supported) {
    result = {
      status: consts.STATUS_INVALID_PARAMETER,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
  }

  var out = put();
  switch (informationLevel) {
    case consts.SMB_QUERY_FILE_BASIC_INFO:
      break;
    case consts.SMB_QUERY_FILE_STANDARD_INFO:
      break;
    case consts.SMB_QUERY_FILE_EA_INFO:
      break;
    case consts.SMB_QUERY_FILE_ALL_INFO:
      break;
    case consts.SMB_QUERY_FILE_STREAM_INFO:
      break;

    case consts.SMB_INFO_STANDARD:
    case consts.SMB_INFO_QUERY_EA_SIZE:
    case consts.SMB_INFO_QUERY_EAS_FROM_LIST:
    case consts.SMB_INFO_QUERY_ALL_EAS:
    case consts.SMB_INFO_IS_NAME_VALID:
    case consts.SMB_QUERY_FILE_NAME_INFO:
    case consts.SMB_QUERY_FILE_ALT_NAME_INFO:
    case consts.SMB_QUERY_FILE_COMPRESSION_INFO:
      logger.error('encountered unsupported command 0x%s', informationLevel.toString(16));
      result = {
        status: consts.STATUS_NOT_IMPLEMENTED,
        params: commandParams,
        data: commandData
      };
      process.nextTick(function () { cb(result); });
      return;

    default:
      result = {
        status: consts.STATUS_OS2_INVALID_LEVEL,
        params: commandParams,
        data: commandData
      };
      process.nextTick(function () { cb(result); });
      return;



/*
    case consts.SMB_INFO_ALLOCATION:
      out.word32le(0) // idFileSystem
        .word32le(8) // cSectorUnit
        .word32le(0xffffffff) // cUnit
        .word32le(0xffffffff) // cUnitAvailable
        .word16le(512); // cbSector
      break;
    case consts.SMB_INFO_VOLUME:
      out.word32le(DEFAULT_SERIAL_NUMBER) // ulVolSerialNbr
        .word8(volumeLabel.length()) // cCharCount
        .put(new Buffer(volumeLabel, 'utf16le'));  // VolumeLabel
      break;
    case consts.SMB_QUERY_FS_VOLUME_INFO:
      // SystemTime
      var long = utils.SystemToSMBTime(Date.now());
      out.word32le(long.getLowBitsUnsigned()) // VolumeCreationTime
        .word32le(long.getHighBitsUnsigned())
        .word32le(DEFAULT_SERIAL_NUMBER) // SerialNumber
        .word32le(volumeLabel.length() * 2)  // VolumeLabelSize
        .word16le(0)  // reserved
        .put(new Buffer(volumeLabel, 'utf16le'));  // VolumeLabel
      break;
    case consts.SMB_QUERY_FS_SIZE_INFO:
      out.word64le(Number.MAX_SAFE_INTEGER) // TotalAllocationUnits
        .word64le(Number.MAX_SAFE_INTEGER) // TotalFreeAllocationUnits
        .word32le(8) // SectorsPerAllocationUnit
        .word16le(512); // BytesPerSector
      break;
    case consts.SMB_QUERY_FS_DEVICE_INFO:
      out.word32le(consts.FILE_DEVICE_DISK) // DeviceType
        .word32le(consts.FILE_VIRTUAL_VOLUME); // DeviceCharacteristics
      break;
    case consts.SMB_QUERY_FS_ATTRIBUTE_INFO:
      // todo
      out.word32le(consts.FILE_CASE_SENSITIVE_SEARCH | consts.FILE_CASE_PRESERVED_NAMES) // FileSystemAttributes
        .word32le(MAX_FILE_NAME_LENGTH)  // MaxFileNameLengthInBytes
        .word32le(FILE_SYSTEM.length * 2)  // LengthOfFileSystemName
        .put(new Buffer(FILE_SYSTEM, 'utf16le'));  // FileSystemName
      break;
*/
 }
  var data = out.buffer();
/*
  var result = {
    status: consts.STATUS_SUCCESS,
    params: utils.EMPTY_BUFFER,
    data: data
  };
*/
  var result = {
    status: consts.STATUS_NOT_IMPLEMENTED,
    params: commandParams,
    data: commandData
  };
  process.nextTick(function () { cb(result); });
}

module.exports = handle;