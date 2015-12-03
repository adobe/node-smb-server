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

var binary = require('binary');
var put = require('put');
var logger = require('winston').loggers.get('smb');
var _ = require('lodash');
var async = require('async');

var consts = require('../../constants');
var utils = require('../../utils');

// flags
var NT_CREATE_REQUEST_OPLOCK = 0x00000002;  // If set, the client requests an exclusive OpLock.
var NT_CREATE_REQUEST_OPBATCH = 0x00000004;  // If set, the client requests an exclusive batch OpLock.
var NT_CREATE_OPEN_TARGET_DIR = 0x00000008; // If set, the client indicates that the parent directory of the target is to be opened.
var NT_CREATE_REQUEST_EXTENDED_RESPONSE = 0x00000010; // If set, then the client is requesting extended information in the response.

// FileStatusFlags
var NO_EAS = 0x0001;  // The file or directory has no extended attributes.
var NO_SUBSTREAMS = 0x0002; // The file or directory has no data streams other than the main data stream.
var NO_REPARSETAG = 0x0004; // The file or directory is not a reparse point.

var ZERO_VOLUME_GUID = new Buffer(16);
ZERO_VOLUME_GUID.fill(0);

/**
 * SMB_COM_NT_CREATE_ANDX (0xA2):
 * This command is used to create and open a new file, or to open an existing file,
 * or to open and truncate an existing file to zero length, or to create a directory,
 * or to create a connection to a named pipe.
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
  var parser = binary.parse(commandParams);
  var paramsObj = parser.skip(4) // skip andX header
    .skip(1)  // Reserved
    .word16le('nameLength')
    .word32le('flags')
    .word32le('rootDirectoryFID')
    .word32le('desiredAccess')
    .word64le('allocationSize')
    .word32le('extFileAttributes')
    .word32le('shareAccess')
    .word32le('createDisposition')
    .word32le('createOptions')
    .word32le('impersonationLevel')
    .word8('securityFlags')
    .vars;
  _.assign(msg, paramsObj);

  // decode data
  // pad to align subsequent unicode strings (utf16le) on word boundary
  var off = utils.calculatePadLength(commandDataOffset, 2);
  msg.fileName = utils.extractUnicodeBytes(commandData, off).toString('utf16le');

  logger.debug('[%s] flags: %s, rootDirectoryFID: %d, desiredAccess: %s, allocationSize: %d, extFileAttributes: %s, shareAccess: %s, createDisposition: 0x%s, createOptions: %s, impersonationLevel: 0x%s, securityFlags: %s, fileName: %s', consts.COMMAND_TO_STRING[commandId].toUpperCase(), msg.flags.toString(2), msg.rootDirectoryFID, msg.desiredAccess.toString(2), msg.allocationSize, msg.extFileAttributes.toString(2), msg.shareAccess.toString(2), msg.createDisposition.toString(16), msg.createOptions.toString(16), msg.impersonationLevel.toString(16), msg.securityFlags.toString(2), msg.fileName);

  // todo evaluate/handle rootDirectoryFID
  // todo evaluate/handle flags, desiredAccess, extFileAttributes and shareAccess according to the CIFS spec

  function getFile(callback) {
    if (msg.rootDirectoryFID) {
      var parent = server.getTree(msg.header.tid).getFile(msg.rootDirectoryFID);
      // todo evaluate/handle rootDirectoryFID, i.e. resolve filname relative to specified parent directory
    }
    server.getTree(msg.header.tid).openOrCreate(msg.fileName, msg.createDisposition, msg.createOptions & consts.FILE_DIRECTORY_FILE, callback);
  }

  function buildResult(file, callback) {
    var smbCreated = utils.systemToSMBTime(file.getCreatedTime());
    var smbLastModified = utils.systemToSMBTime(file.getLastModifiedTime());
    var smbLastAccessed = utils.systemToSMBTime(file.getLastAccessedTime());
    var smbLastChanged = utils.systemToSMBTime(file.getLastChangedTime());

    // params
    var out = put();
    out.word8(commandParams.readUInt8(0)) // andX next cmd id
      .word8(0) // andX reserved
      .word16le(commandParams.readUInt16LE(2))  // andX offset (needs to be recalculated by caller!)
      .word8(msg.flags & NT_CREATE_REQUEST_OPBATCH ? 2 : 0)  // OpLockLevel
      .word16le(file.fid) // FID
      .word32le(file.getOpenAction()) // CreateDisposition
      .word32le(smbCreated.getLowBitsUnsigned()) // CreationTime
      .word32le(smbCreated.getHighBitsUnsigned())
      .word32le(smbLastAccessed.getLowBitsUnsigned()) // LastAccessTime
      .word32le(smbLastAccessed.getHighBitsUnsigned())
      .word32le(smbLastModified.getLowBitsUnsigned()) // LastWriteTime
      .word32le(smbLastModified.getHighBitsUnsigned())
      .word32le(smbLastChanged.getLowBitsUnsigned()) // LastChangeTime
      .word32le(smbLastChanged.getHighBitsUnsigned())
      //.word32le(file.getAttributes()) // ExtFileAttributes
      .word32le(file.getAttributes()) // ExtFileAttributes
      .word64le(file.getAllocationSize()) // AllocationSize
      .word64le(file.getDataSize()) // EndOfFile
      .word16le(0);  // ResourceType
    if (msg.flags & NT_CREATE_REQUEST_EXTENDED_RESPONSE) {
      // MS-SMB v1.0
      out.word16le(NO_EAS | NO_SUBSTREAMS | NO_REPARSETAG)  // FileStatusFlags
        .word8(file.isDirectory() ? 1 : 0)  // Directory
        .put(ZERO_VOLUME_GUID)  // VolumeGUID
        .word64le(0)  // FileId
        .word32le(file.isDirectory() ? consts.DIRECTORY_ACCESS_ALL : consts.FILE_ACCESS_ALL)  // MaximalAccessRights
        .word32le(file.isDirectory() ? consts.DIRECTORY_ACCESS_READONLY : consts.FILE_ACCESS_READONLY);  // GuestMaximalAccessRights
    } else {
      // CIFS
      out.word16le(0)  // NMPipeStatus2
        .word8(file.isDirectory() ? 1 : 0);  // Directory
    }
    var params = out.buffer();

    var result = {
      status: consts.STATUS_SUCCESS,
      params: params,
      data: utils.EMPTY_BUFFER
    };
    callback(null, result);
  }

  async.waterfall([ getFile, buildResult ], function (err, result) {
    if (err) {
      logger.debug(msg.fileName, err.message ? err.message : err);
      cb({
        status: err.status || consts.STATUS_UNSUCCESSFUL,
        params: commandParams,
        data: commandData
      });
    } else {
      cb(result);
    }
  });
}

module.exports = handle;