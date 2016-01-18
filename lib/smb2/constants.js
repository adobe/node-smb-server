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
  0x00: 'negotiate',
  0x01: 'session_setup',
  0x02: 'logoff',
  0x03: 'tree_connect',
  0x04: 'tree_disconnect',
  0x05: 'create',
  0x06: 'close',
  0x07: 'flush',
  0x08: 'read',
  0x09: 'write',
  0x0a: 'lock',
  0x0b: 'ioctl',
  0x0c: 'cancel',
  0x0d: 'echo',
  0x0e: 'query_directory',
  0x0f: 'change_notify',
  0x10: 'query_info',
  0x11: 'set_info',
  0x12: 'oplock_break'
};

consts.STRING_TO_COMMAND = _.invert(consts.COMMAND_TO_STRING);

module.exports = consts;
