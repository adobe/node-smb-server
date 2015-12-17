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
var binary = require('binary');

var consts = require('../../../constants');
var utils = require('../../../utils');

// Size of <code>FILE_NOTIFY_INFORMATION_SIZE</code> (without file name).
// (see https://msdn.microsoft.com/en-us/library/dn392331.aspx?f=255&MSPPError=-2147217396)
var FILE_NOTIFY_INFORMATION_SIZE = 12;

/**
 * NT_TRANSACT_NOTIFY_CHANGE (0x0004): This command notifies the client when the directory, specified by FID, is modified.
 * It also returns the names of all file system objects that changed, and the ways in which they were modified..
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
  // decode setup
  var parser = binary.parse(msg.setup);
  var setup = parser.word32le('completionFilter')
    .word16le('fid')
    .word8le('watchTree')
    .vars;

  var tree = server.getTree(msg.header.tid);
  var fileName = tree && tree.getFile(setup.fid) && tree.getFile(setup.fid).getName() || '';

  logger.debug('[%s] completionFilter: %s, fid: %d [fileName: %s], watchTree: %d', consts.NTTRANS_SUBCOMMAND_TO_STRING[commandId].toUpperCase(), setup.completionFilter.toString(2), setup.fid, fileName, setup.watchTree);

  // nt_transact_notify_change has a special contract:
  // it does send an immediate null or error response potentially followed
  // by an out-of-band response with the change notification at some later point in time.

  var result;
  if (!tree) {
    result = {
      status: consts.STATUS_SMB_BAD_TID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  var file = tree.getFile(setup.fid);
  if (!file) {
    result = {
      status: consts.STATUS_SMB_BAD_FID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }

  tree.registerChangeListener(msg.header.mid, file, !!setup.watchTree, setup.completionFilter, function (action, oldName, newName) {
    onChange(action, oldName, newName, cb);
  });

  // invoke 'empty' callback; a potential notification response will be sent at some later point in time
  process.nextTick(function() { cb(null); });
}

/**
 * Event handler notified when some file changes in a watched directory
 *
 * @param {Number} action - file action
 * @param {String} name - name of file that changed
 * @param {String} [newName] - optional, new name if this was a rename
 * @param {Function} cb callback called with the command's result
 */
function onChange(action, name, newName, cb) {
  var paramsOut, fileNameBytes, nextEntryOffset, pad;
  switch (action) {
    case consts.FILE_ACTION_ADDED:
      fileNameBytes = new Buffer(name, 'utf16le');
      paramsOut = put()
        .word32le(0) // NextEntryOffset
        .word32le(action) // Action
        .word32le(fileNameBytes.length) // FileNameLength
        .put(fileNameBytes); // FileName
      break;
    case consts.FILE_ACTION_REMOVED:
      fileNameBytes = new Buffer(name, 'utf16le');
      paramsOut = put()
        .word32le(0) // NextEntryOffset
        .word32le(action) // Action
        .word32le(fileNameBytes.length) // FileNameLength
        .put(fileNameBytes); // FileName
      break;
    case consts.FILE_ACTION_MODIFIED:
      fileNameBytes = new Buffer(name, 'utf16le');
      paramsOut = put()
        .word32le(0) // NextEntryOffset
        .word32le(action) // Action
        .word32le(fileNameBytes.length) // FileNameLength
        .put(fileNameBytes); // FileName
      break;
    case consts.FILE_ACTION_RENAMED_OLD_NAME:
    case consts.FILE_ACTION_RENAMED_NEW_NAME:
      fileNameBytes = new Buffer(name, 'utf16le');
      paramsOut = put()
        .word32le(0) // NextEntryOffset
        .word32le(action) // Action
        .word32le(fileNameBytes.length) // FileNameLength
        .put(fileNameBytes); // FileName
      break;
    case consts.FILE_ACTION_RENAMED:
      fileNameBytes = new Buffer(name, 'utf16le');
      nextEntryOffset = FILE_NOTIFY_INFORMATION_SIZE + fileNameBytes.length;
      pad = utils.calculatePadLength(nextEntryOffset, 4);
      nextEntryOffset += pad;
      paramsOut = put()
        .word32le(nextEntryOffset) // NextEntryOffset
        .word32le(consts.FILE_ACTION_RENAMED_OLD_NAME) // Action
        .word32le(fileNameBytes.length) // FileNameLength
        .put(fileNameBytes) // FileName
        .pad(pad);
      fileNameBytes = new Buffer(newName, 'utf16le');
      paramsOut.word32le(0) // NextEntryOffset
        .word32le(consts.FILE_ACTION_RENAMED_NEW_NAME) // Action
        .word32le(fileNameBytes.length) // FileNameLength
        .put(fileNameBytes); // FileName
      break;
  }
  if (paramsOut) {
    if (action === consts.FILE_ACTION_RENAMED) {
      logger.debug('[NT_TRANSACT_NOTIFY_CHANGE][%s] name: %s, newName: %s', consts.FILE_ACTION_TO_STRING[action].toUpperCase(), name, newName);
    } else {
      logger.debug('[NT_TRANSACT_NOTIFY_CHANGE][%s] name: %s', consts.FILE_ACTION_TO_STRING[action].toUpperCase(), name);
    }
    var result = {
      status: consts.STATUS_SUCCESS,
      params: paramsOut.buffer(),
      data: utils.EMPTY_BUFFER
    };
    cb(result);
  }
}

module.exports = handle;
