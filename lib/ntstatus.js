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
 * a selection of 32bit NT Status codes (see [MS-ERREF] 2.3 for complete list)
 */
consts.STATUS_SUCCESS = 0x00000000;
consts.STATUS_INVALID_SMB = 0x00010002; // At least one command parameter fails validation tests such as a field value being out of range or fields within a command being internally inconsistent.
consts.STATUS_SMB_BAD_TID = 0x00050002; // The TID specified in the command was invalid.
consts.STATUS_SMB_BAD_FID = 0x00060001; // Invalid FID.
consts.STATUS_SMB_BAD_UID = 0x005b0002; // The UID specified is not known as a valid ID on this server session.
consts.STATUS_SMB_BAD_COMMAND = 0x00160002; // An unknown SMB command code was received by the server.
consts.STATUS_OS2_INVALID_LEVEL = 0x007c0001; // Invalid information level.
consts.STATUS_UNSUCCESSFUL = 0xc0000001;  // General error.
consts.STATUS_NOT_IMPLEMENTED = 0xc0000002; // Unrecognized SMB command code.
consts.STATUS_INVALID_HANDLE = 0xc0000008;  // Invalid FID.
consts.STATUS_END_OF_FILE = 0xc0000011;  // Attempted to read beyond the end of the file..
consts.STATUS_INVALID_PARAMETER = 0xc000000d; // A parameter supplied with the message is invalid.
consts.STATUS_NO_SUCH_FILE = 0xc000000f;  // File not found.
consts.STATUS_MORE_PROCESSING_REQUIRED = 0xc0000016;  // There is more data available to read on the designated named pipe.
consts.STATUS_ACCESS_DENIED = 0xc0000022; // Access denied.
consts.STATUS_OBJECT_NAME_NOT_FOUND = 0xc0000034; // File not found.
consts.STATUS_OBJECT_NAME_COLLISION = 0xc0000035; // An attempt to create a file or directory failed because an object with the same pathname already exists.
consts.STATUS_OBJECT_PATH_NOT_FOUND = 0xc000003a; // File not found.
consts.STATUS_EAS_NOT_SUPPORTED = 0xc000004f; // The server file system does not support Extended Attributes.
consts.STATUS_EA_TOO_LARGE = 0xc0000050;  // Either there are no extended attributes, or the available extended attributes did not fit into the response.
consts.STATUS_WRONG_PASSWORD = 0xc000006a;  // Invalid password.
consts.STATUS_LOGON_FAILURE = 0xc000006d;
consts.STATUS_IO_TIMEOUT = 0xc00000b5;  // Operation timed out.
consts.STATUS_FILE_IS_A_DIRECTORY = 0xc00000ba;
consts.STATUS_UNEXPECTED_NETWORK_ERROR = 0xc00000c4;  // Operation timed out.
consts.STATUS_NETWORK_ACCESS_DENIED = 0xc00000ca; // Access denied. The specified UID does not have permission to execute the requested command within the current context (TID).
consts.STATUS_BAD_DEVICE_TYPE = 0xc00000cb; // Resource type invalid. Value of Service field in the request was invalid.
consts.STATUS_BAD_NETWORK_NAME = 0xc00000cc;  // Invalid server name in Tree Connect.
consts.STATUS_TOO_MANY_SESSIONS = 0xc00000ce; // Too many UIDs active for this SMB connection.
consts.STATUS_REQUEST_NOT_ACCEPTED = 0xc00000d0;  // No resources currently available for this SMB request.
consts.STATUS_NOT_A_DIRECTORY = 0xc0000103;
consts.STATUS_SMB_NO_SUPPORT = 0xffff0002;  // Function not supported by the server.

consts.STATUS_TO_STRING = _.reduce(
  consts,
  function (result, val, nm) {
    if (nm.indexOf('STATUS_') === 0) {
      result[val] = nm;
    }
    return result;
  },
  {}
);

module.exports = consts;
