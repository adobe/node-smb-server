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

var _ = require('lodash');

var consts = {};

/**
 * SMB 2.x/3.x constants
 */

/**
 * SMB 2.x/3.x commands (covers NT LAN Manager dialect)
 */
consts.COMMAND_TO_STRING = {
  0x0000: 'negotiate',
  0x0001: 'session_setup',
  0x0002: 'logoff',
  0x0003: 'tree_connect',
  0x0004: 'tree_disconnect',
  0x0005: 'create',
  0x0006: 'close',
  0x0007: 'flush',
  0x0008: 'read',
  0x0009: 'write',
  0x000a: 'lock',
  0x000b: 'ioctl',
  0x000c: 'cancel',
  0x000d: 'echo',
  0x000e: 'query_directory',
  0x000f: 'change_notify',
  0x0010: 'query_info',
  0x0011: 'set_info',
  0x0012: 'oplock_break'
};

consts.STRING_TO_COMMAND = _.invert(consts.COMMAND_TO_STRING);

// protocol id
consts.PROTOCOL_ID = new Buffer([ 0xfe, 0x53, 0x4d, 0x42 ]);  // 0xfe, 'S', 'M', 'B'

// fixed header length
consts.HEADER_LENGTH = 64;

/**
 * flags
 */
consts.FLAGS_SERVER_TO_REDIR = 0x00000001;
consts.FLAGS_ASYNC_COMMAND = 0x00000002;
consts.FLAGS_RELATED_OPERATIONS = 0x00000004;
consts.FLAGS_SIGNED = 0x00000008;
consts.FLAGS_PRIORITY_MASK = 0x00000070; // SMB 3.1.1 only
consts.FLAGS_DFS_OPERATIONS = 0x10000000;
consts.FLAGS_REPLAY_OPERATION = 0x20000000; // SMB 3.x only

/**
 * Capabilities
 */
consts.GLOBAL_CAP_DFS = 0x00000001; // When set, indicates that the client supports the Distributed File System (DFS).
consts.GLOBAL_CAP_LEASING = 0x00000002; // When set, indicates that the client supports leasing.
consts.GLOBAL_CAP_LARGE_MTU = 0x00000004; // When set, indicates that the client supports multi-credit operations.
consts.GLOBAL_CAP_MULTI_CHANNEL = 0x00000008; // When set, indicates that the client supports establishing multiple channels for a single session.
consts.GLOBAL_CAP_PERSISTENT_HANDLES = 0x00000010;  // When set, indicates that the client supports persistent handles.
consts.GLOBAL_CAP_DIRECTORY_LEASING = 0x00000020; // When set, indicates that the client supports directory leasing.
consts.GLOBAL_CAP_ENCRYPTION = 0x00000040;  // When set, indicates that the client supports encryption.

/**
 * SecurityMode
 */
consts.NEGOTIATE_SIGNING_ENABLED = 0x0001; // When set, indicates that security signatures are enabled on the server.
consts.NEGOTIATE_SIGNING_REQUIRED = 0x0002;  // When set, indicates that security signatures are required by the server

/**
 * dialects
 */
consts.SMB_2_0_2 = 0x0202;  // SMB 2.0.2 dialect revision number.
consts.SMB_2_1_0 = 0x0210;  // SMB 2.1 dialect revision number.
consts.SMB_2_X_X = 0x02ff;
consts.SMB_3_0_0 = 0x0300;  // SMB 3.0 dialect revision number.
consts.SMB_3_0_2 = 0x0302;  // SMB 3.0.2 dialect revision number.
consts.SMB_3_1_1 = 0x0311;  // SMB 3.1.1 dialect revision number.
consts.SMB_3_X_X = 0x03ff;

module.exports = consts;
