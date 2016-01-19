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
consts.PROTOCOL_ID = new Buffer([ 0xfe, 'S', 'M', 'B' ]);

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

module.exports = consts;
