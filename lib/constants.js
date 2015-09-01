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

consts.COMMAND_TO_STRING = {
  0x72: 'negotiate'
};

consts.STRING_TO_COMMAND = _.invert(consts.COMMAND_TO_STRING);

// header length
consts.SMB_HEADER_LENGTH = 32;
// minimum SMB length: header + 1
consts.SMB_MIN_LENGTH = consts.SMB_HEADER_LENGTH + 2;
consts.SMB_MAX_LENGTH = 0xffff;

module.exports = consts;