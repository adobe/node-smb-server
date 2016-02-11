/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var put = require('put');
var binary = require('binary');
var _ = require('lodash');
var logger = require('winston').loggers.get('smb');

var ntstatus = require('../../ntstatus');
var SMB = require('../constants');
var utils = require('../../utils');

// flags
var TREE_CONNECT_ANDX_DISCONNECT_TID = 0x0001;  // If set and SMB_Header.TID is valid, the tree connect specified by the TID in the SMB header of the request SHOULD be disconnected when the server sends the response.
var TREE_CONNECT_ANDX_EXTENDED_SIGNATURES = 0x0004; // If set, then the client is requesting signing key protection
var TREE_CONNECT_ANDX_EXTENDED_RESPONSE = 0x0008; // If set, then the client is requesting extended information in the SMB_COM_TREE_CONNECT_ANDX response.

// optionalSupport
var SMB_SUPPORT_SEARCH_BITS = 0x1;
var SMB_SHARE_IS_IN_DFS = 0x2;
// nativeFileSystem
var NATIVE_FILE_SYSTEM = 'NTFS';  // todo test e.g. with 'JCR'

/**
 * SMB_COM_TREE_CONNECT_ANDX (0x75): Tree connect with AndX chaining.
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
    .word16le('flags')
    .word16le('passwordLength')
    .vars;
  _.assign(msg, paramsObj);

  var result;

  // decode data
  var off = 0;
  msg.password = commandData.slice(off, off + msg.passwordLength);
  off += msg.passwordLength;
  off += utils.calculatePadLength(commandDataOffset + off, 2);   // pad to align subsequent unicode strings (utf16le) on word boundary
  var bytes = utils.extractUnicodeBytes(commandData, off);
  msg.path = bytes.toString('utf16le');
  off += bytes.length + 2;
  bytes = utils.extractAsciiBytes(commandData, off);
  msg.service = bytes.toString('ascii');
  off += bytes.length + 1;

  logger.debug('[%s] flags: %s, password: %s, service: %s, path: %s', SMB.COMMAND_TO_STRING[commandId].toUpperCase(), msg.flags.toString(2), msg.password.toString('hex'), msg.service, msg.path);

  var shareName = msg.path.substring(msg.path.lastIndexOf('\\') + 1);
  var shareLevelPassword = utils.bufferEquals(msg.password, new Buffer([ 0x00 ])) ? null : msg.password;
  if (_.indexOf(server.getShareNames(), shareName) === -1) {
    result = {
      status: ntstatus.STATUS_OBJECT_PATH_NOT_FOUND,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }
  var session = server.getSession(msg.header.uid);
  if (!session) {
    result = {
      status: ntstatus.STATUS_SMB_BAD_UID,
      params: commandParams,
      data: commandData
    };
    process.nextTick(function () { cb(result); });
    return;
  }
  server.connectTree(session, shareName, shareLevelPassword, function (err, tree) {
    if (err) {
      result = {
        status: ntstatus.STATUS_ACCESS_DENIED,
        params: commandParams,
        data: commandData
      };
      cb(result);
      return;
    }

    var service = tree.getShare().isNamedPipe() ? SMB.SERVICE_NAMEDPIPE : SMB.SERVICE_DISKSHARE;
    if (msg.service !== SMB.SERVICE_ANY && msg.service !== service) {
      result = {
        status: ntstatus.STATUS_BAD_DEVICE_TYPE,
        params: commandParams,
        data: commandData
      };
      process.nextTick(function () { cb(result); });
      return;
    }

    // build response
    msg.header.tid = tree.tid;
    // params
    var out = put();
    out.word8(commandParams.readUInt8(0)) // andX next cmd id
      .word8(0) // andX reserved
      .word16le(commandParams.readUInt16LE(2))  // andX offset (needs to be recalculated by caller!)
      .word16le(SMB_SUPPORT_SEARCH_BITS);  // optionalSupport
    if (msg.flags & TREE_CONNECT_ANDX_EXTENDED_RESPONSE) {
      // MS-SMB v1.0
      out.word32le(SMB.TREE_ACCESS_ALL)  // MaximalShareAccessRights
        .word32le(SMB.TREE_ACCESS_READONLY);  // GuestMaximalShareAccessRights
    }
    var params = out.buffer();
    // data
    out = put();
    out.put(new Buffer(service, 'ascii')).word8(0)  // service
      .put(new Buffer(NATIVE_FILE_SYSTEM, 'utf16le')).word16le(0);   // nativeFileSystem
    var data = out.buffer();
    // return result
    result = {
      status: ntstatus.STATUS_SUCCESS,
      params: params,
      data: data
    };
    cb(result);
  });
}

module.exports = handle;
