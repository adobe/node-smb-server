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
 * CIFS commands (covers NT LAN Manager dialect)
 */
consts.COMMAND_TO_STRING = {
  0x00: 'create_directory', // deprecated
  0x01: 'delete_directory',
  0x02: 'open', // deprecated
  0x03: 'create', // deprecated
  0x04: 'close',
  0x05: 'flush',
  0x06: 'delete',
  0x07: 'rename',
  0x08: 'query_information', // deprecated
  0x09: 'set_information', // deprecated
  0x0a: 'read', // deprecated
  0x0b: 'write', // deprecated
  0x0c: 'lock_byte_range', // deprecated
  0x0d: 'unlock_byte_range', // deprecated
  0x0e: 'create_temporary', // obsolescent
  0x0f: 'create_new', // deprecated
  0x10: 'check_directory',
  0x11: 'process_exit', // obsolescent
  0x12: 'seek', // obsolescent
  0x13: 'lock_and_read', // deprecated
  0x14: 'write_and_unlock', // deprecated
  0x1a: 'read_raw', // deprecated
  0x1b: 'read_mpx', // obsolescent
  0x1c: 'read_mpx_secondary', // obsolete
  0x1d: 'write_raw', // deprecated
  0x1e: 'write_mpx', // obsolescent
  0x1f: 'write_mpx_secondary', // obsolete
  0x20: 'write_complete', // deprecated
  0x21: 'query_server', // reserved
  0x22: 'set_information2',  // deprecated
  0x23: 'query_information2',  // deprecated
  0x24: 'locking_andx',
  0x25: 'transaction',
  0x26: 'transaction_secondary',
  0x27: 'ioctl',  // obsolescent
  0x28: 'ioctl_secondary',  // reserved
  0x29: 'copy', // obsolete
  0x2a: 'move', // obsolete
  0x2b: 'echo',
  0x2c: 'write_and_close',  // deprecated
  0x2d: 'open_andx',
  0x2e: 'read_andx',
  0x2f: 'write_andx',
  0x30: 'new_file_size',  // reserved
  0x31: 'close_and_tree_disc',  // reserved
  0x32: 'transaction2',
  0x33: 'transaction2_secondary',
  0x34: 'find_close2',
  0x35: 'find_notify_close',  // reserved
  0x70: 'tree_connect', // deprecated
  0x71: 'tree_disconnect',
  0x72: 'negotiate',
  0x73: 'session_setup_andx',
  0x74: 'logoff_andx',
  0x75: 'tree_connext_andx',
  0x7e: 'security_package_andx',  // obsolete
  0x80: 'query_information_disk',   // deprecated
  0x81: 'search',  // deprecated
  0x82: 'find',  // deprecated
  0x83: 'find_unique',  // deprecated
  0x84: 'find_close',  // deprecated
  0xa0: 'nt_transact',
  0xa1: 'nt_transact_secondary',
  0xa2: 'nt_create_andx',
  0xa4: 'nt_cancel',
  0xa5: 'nt_rename',   // obsolescent
  0xc0: 'open_print_file',
  0xc1: 'write_print_file',  // deprecated
  0xc2: 'close_print_file',  // deprecated
  0xc3: 'get_print_queue',  // obsolete
  0xd8: 'read_bulk',  // reserved
  0xd9: 'write_bulk',  // reserved
  0xda: 'write_bulk_data'  // reserved
  //0xfe: 'invalid',
  //0xff: 'no_andx_command'
};

consts.STRING_TO_COMMAND = _.invert(consts.COMMAND_TO_STRING);

/**
 * dialects
 */
// the dialect we're supporting
consts.DIALECT_NT_LM_0_12 = 'NT LM 0.12';

// header length
consts.SMB_HEADER_LENGTH = 32;
// minimum SMB length: header + 1 byte (wordCount) + 1 word (byteCount)
consts.SMB_MIN_LENGTH = consts.SMB_HEADER_LENGTH + 1 + 2;
consts.SMB_MAX_LENGTH = 0xffffff;   // assuming 24-bit length in 4-byte NetBIOS message header

/**
 * flags
 */
consts.FLAGS_REPLY = 1 << 7;
consts.FLAGS_BATCH_OPLOCK = 1 << 6;
consts.FLAGS_OPLOCK = 1 << 5;
consts.FLAGS_CANONICAL_PATHNAMES = 1 << 4;
consts.FLAGS_CASELESS_PATHNAMES = 1 << 3;
// bit 2 reserved
// bit 1 only applies to NetBEUI which we are not supporting
consts.FLAGS_SUPPORT_LOCKREAD = 1 << 0;

consts.FLAGS2_UNICODE_STRINGS = 1 << 15;
consts.FLAGS2_STATUS = 1 << 14;
consts.FLAGS2_READ_IF_EXECUTE = 1 << 13;
consts.FLAGS2_DFS_PATHNAMES = 1 << 12;
consts.FLAGS2_EXTENDED_SECURITY = 1 << 11;
// bit 10 reserved
// bit 9 reserved
// bit 8 reserved
// bit 7 reserved
consts.FLAGS2_IS_LONG_NAME = 1 << 6;
// bit 5 reserved
consts.FLAGS2_SECURITY_SIGNATURE_REQUIRED = 1 << 4;
// bit 3 reserved
consts.FLAGS2_SECURITY_SIGNATURE = 1 << 2;
consts.FLAGS2_EAS = 1 << 1;
consts.FLAGS2_KNOWS_LONG_NAMES = 1 << 0;

/**
 * capabilities
 */
consts.CAP_RAW_MODE = (1 << 0);
consts.CAP_MPX_MODE = (1 << 1);
consts.CAP_UNICODE = (1 << 2);
consts.CAP_LARGE_FILES = (1 << 3);
consts.CAP_NT_SMBS = (1 << 4);
consts.CAP_RPC_REMOTE_APIS = (1 << 5);
consts.CAP_STATUS32 = (1 << 6);
consts.CAP_LEVEL2_OPLOCKS = (1 << 7);
consts.CAP_LOCK_AND_READ = (1 << 8);
consts.CAP_NT_FIND = (1 << 9);
consts.CAP_DFS = (1 << 12);
consts.CAP_INFOLEVEL_PASSTHRU = (1 << 13);
consts.CAP_LARGE_READX = (1 << 14);
consts.CAP_LARGE_WRITEX = (1 << 15);
consts.CAP_UNIX = (1 << 23);
consts.CAP_RESERVED = (1 << 25);
consts.CAP_BULK_TRANSFER = (1 << 29);
consts.CAP_COMPRESSED_DATA = (1 << 30);
consts.CAP_EXTENDED_SECURITY = (1 << 31);

/**
 * status
 */
consts.STATUS_SUCCESS = 0x00000000;

consts.STATUS_INVALID_SMB = 0x00010002; // At least one command parameter fails validation tests such as a field value being out of range or fields within a command being internally inconsistent.
consts.STATUS_SMB_BAD_TID = 0x00050002; // The TID specified in the command was invalid.
consts.STATUS_SMB_BAD_FID = 0x00060001; // Invalid FID.
consts.STATUS_SMB_BAD_UID = 0x005b0002; // The UID specified is not known as a valid ID on this server session.
consts.STATUS_SMB_BAD_COMMAND = 0x00160002; // An unknown SMB command code was received by the server.

consts.STATUS_UNSUCCESSFUL = 0xc0000001;  // General error.
consts.STATUS_NOT_IMPLEMENTED = 0xc0000002; // Unrecognized SMB command code.
consts.STATUS_INVALID_HANDLE = 0xc0000008;  // Invalid FID.
consts.STATUS_INVALID_PARAMETER = 0xc000000d; // A parameter supplied with the message is invalid.
consts.STATUS_NO_SUCH_FILE = 0xc000000f;  // File not found.
consts.STATUS_MORE_PROCESSING_REQUIRED = 0xc0000016;  // There is more data available to read on the designated named pipe.
consts.STATUS_ACCESS_DENIED = 0xc0000022; // Access denied.
consts.STATUS_OBJECT_NAME_NOT_FOUND = 0xc0000034; // File not found.
consts.STATUS_OBJECT_NAME_COLLISION = 0xc0000035; // An attempt to create a file or directory failed because an object with the same pathname already exists.
consts.STATUS_EAS_NOT_SUPPORTED = 0xc000004f; // The server file system does not support Extended Attributes.
consts.STATUS_EA_TOO_LARGE = 0xc0000050;  // Either there are no extended attributes, or the available extended attributes did not fit into the response.
consts.STATUS_WRONG_PASSWORD = 0xc000006a;  // Invalid password.
consts.STATUS_LOGON_FAILURE = 0xc000006d;
consts.STATUS_IO_TIMEOUT = 0xc00000b5;  // Operation timed out.
consts.STATUS_FILE_IS_A_DIRECTORY = 0xc00000ba;
consts.STATUS_UNEXPECTED_NETWORK_ERROR = 0xc00000c4;  // Operation timed out.
consts.STATUS_NETWORK_ACCESS_DENIED = 0xc00000ca; // Access denied. The specified UID does not have permission to execute the requested command within the current context (TID).
consts.STATUS_BAD_NETWORK_NAME = 0xc00000cc;  // Invalid server name in Tree Connect.
consts.STATUS_TOO_MANY_SESSIONS = 0xc00000ce; // Too many UIDs active for this SMB connection.
consts.STATUS_REQUEST_NOT_ACCEPTED = 0xc00000d0;  // No resources currently available for this SMB request.
consts.STATUS_NOT_A_DIRECTORY = 0xc0000103;

consts.STATUS_SMB_NO_SUPPORT = 0xffff0002;  // Function not supported by the server.

/**
 * security mode
 */
consts.NEGOTIATE_USER_SECURITY = 0x01;
consts.NEGOTIATE_ENCRYPT_PASSWORDS = 0x02;  // challenge/response
consts.NEGOTIATE_SECURITY_SIGNATURES_ENABLED = 0x04;
consts.NEGOTIATE_SECURITY_SIGNATURES_REQUIRED = 0x08;

module.exports = consts;