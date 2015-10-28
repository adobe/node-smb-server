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

consts.MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;
consts.MIN_SAFE_INTEGER = -Number.MAX_SAFE_INTEGER;

consts.NATIVE_LANMAN = 'node-smb-server';

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
  0x75: 'tree_connect_andx',
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
 * Transaction2 subcommands (covers NT LAN Manager dialect)
 */
consts.TRANS2_SUBCOMMAND_TO_STRING = {
  0x01: 'trans2_find_first2',
  0x02: 'trans2_find_next2',
  0x03: 'trans2_query_fs_information',
  0x04: 'trans2_set_fs_information', // reserved
  0x05: 'trans2_query_path_information',
  0x06: 'trans2_set_path_information',
  0x07: 'trans2_query_file_information',
  0x08: 'trans2_set_file_information',
  0x09: 'trans2_fsctl', // reserved
  0x0a: 'trans2_ioctl2', // reserved
  0x0b: 'trans2_find_notify_first', // obsolete
  0x0c: 'trans2_find_notify_next', // obsolete
  0x0d: 'trans2_create_directory',
  0x0e: 'trans2_session_setup', // reserved
  0x10: 'trans2_get_dfs_referral',
  0x11: 'trans2_report_dfs_inconsistency' // reserved
};

consts.STRING_TO_TRANS2_SUBCOMMAND = _.invert(consts.TRANS2_SUBCOMMAND_TO_STRING);

/**
 * NT_Transact subcommands
 */
consts.NTTRANS_SUBCOMMAND_TO_STRING = {
  0x0001: 'nt_transact_create',
  0x0002: 'nt_transact_ioctl',
  0x0003: 'nt_transact_set_security_desc',
  0x0004: 'nt_transact_notify_change',
  0x0005: 'nt_transact_rename',
  0x0006: 'nt_transact_query_security_desc'
};

consts.STRING_TO_NTTRANS_SUBCOMMAND = _.invert(consts.NTTRANS_SUBCOMMAND_TO_STRING);

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
 * service
 */
consts.SERVICE_DISKSHARE = 'A:';
consts.SERVICE_PRINTER = 'LPT1:';
consts.SERVICE_NAMEDPIPE = 'IPC';
consts.SERVICE_COMM = 'COMM';
consts.SERVICE_ANY = '?????';

/**
 * share type
 */
consts.SHARE_TYPE_DISK = 0x0000;
consts.SHARE_TYPE_PRINTER = 0x0001;
consts.SHARE_TYPE_COMM = 0x0002;
consts.SHARE_TYPE_IPC = 0x0003;

/**
 * QUERY_FS information level codes
 */
consts.QUERY_FS_INFO_ALLOCATION = 0x0001;  // Query file system allocation unit information.
consts.QUERY_FS_INFO_VOLUME = 0x0002;  // Query volume name and serial number.
consts.QUERY_FS_VOLUME_INFO = 0x0102;  // Query the creation timestamp, serial number, and Unicode-encoded volume label.
consts.QUERY_FS_SIZE_INFO = 0x0103;  // Query 64-bit file system allocation unit information.
consts.QUERY_FS_DEVICE_INFO = 0x0104;  // Query a file system's underlying device type and characteristics.
consts.QUERY_FS_ATTRIBUTE_INFO = 0x0105;  // Query file system attributes.

consts.QUERY_FS_INFORMATION_LEVEL_TO_STRING = _.reduce(
  consts,
  function (result, val, nm) {
    if (nm.indexOf('QUERY_FS_') === 0) {
      result[val] = nm;
    }
    return result
  },
  {}
);

/**
 * QUERY information level codes
 */
consts.QUERY_INFO_STANDARD = 0x0001;  // Query creation, access, and last write timestamps, size and file attributes.
consts.QUERY_INFO_QUERY_EA_SIZE = 0x0002; // Query the QUERY_INFO_STANDARD data along with the size of the file's extended attributes (EAs).
consts.QUERY_INFO_QUERY_EAS_FROM_LIST = 0x0003; // Query a file's specific EAs by attribute name.
consts.QUERY_QUERY_ALL_EAS = 0x0004; // Query all of a file's EAs.
consts.QUERY_IS_NAME_VALID = 0x0006; // Validate the syntax of the path provided in the request. Not supported for TRANS2_QUERY_FILE_INFORMATION.
consts.QUERY_FILE_BASIC_INFO = 0x0101;  // Query 64-bit create, access, write, and change timestamps along with extended file attributes.
consts.QUERY_FILE_STANDARD_INFO = 0x0102; // Query size, number of links, if a delete is pending, and if the path is a directory.
consts.QUERY_FILE_EA_INFO = 0x0103; // Query the size of the file's EAs.
consts.QUERY_FILE_NAME_INFO = 0x0104; // Query the long file name in Unicode format.
consts.QUERY_FILE_ALL_INFO = 0x0107;  // Query the QUERY_FILE_BASIC_INFO, QUERY_FILE_STANDARD_INFO, QUERY_FILE_EA_INFO, and QUERY_FILE_NAME_INFO data as well as access flags, access mode, and alignment information in a single request.
consts.QUERY_FILE_ALT_NAME_INFO = 0x0108; // Query the 8.3 file name.
consts.QUERY_FILE_STREAM_INFO = 0x0109; // Query file stream information.
consts.QUERY_FILE_COMPRESSION_INFO = 0x010B;  // Query file compression information.

consts.QUERY_PATH_INFORMATION_LEVEL_TO_STRING = _.reduce(
  consts,
  function (result, val, nm) {
    if (nm.indexOf('QUERY_FS_') !== 0 && nm.indexOf('QUERY_') === 0) {
      result[val] = nm;
    }
    return result
  },
  {}
);

/**
 * FIND information level codes
 */
consts.FIND_INFO_STANDARD = 0x0001;  // Return creation, access, and last write timestamps, size and file attributes along with the file name.
consts.FIND_INFO_EA_SIZE = 0x0002; // Return the FIND_INFO_STANDARD data along with the size of a file's extended attributes (EAs).
consts.FIND_INFO_EAS_FROM_LIST = 0x0003; // Return the FIND_INFO_EA_SIZE data along with a specific list of a file's EAs. The requested EAs are provided in the Trans2_Data block of the request.
consts.FIND_FILE_DIRECTORY_INFO = 0x0101; // Return 64-bit format versions of: creation, access, last write, and last attribute change timestamps; size. In addition, return extended file attributes and file name.
consts.FIND_FILE_FULL_DIRECTORY_INFO = 0x0102;  // Returns the FIND_FILE_DIRECTORY_INFO data along with the size of a file's EAs.
consts.FIND_FILE_NAMES_INFO = 0x0103; // Returns the name(s) of the file(s).
consts.FIND_FILE_BOTH_DIRECTORY_INFO = 0x0104;  // Returns a combination of the data from FIND_FILE_FULL_DIRECTORY_INFO and FIND_FILE_NAMES_INFO.

consts.FIND_INFORMATION_LEVEL_TO_STRING = _.reduce(
  consts,
  function (result, val, nm) {
    if (nm.indexOf('FIND_') === 0) {
      result[val] = nm;
    }
    return result
  },
  {}
);

/**
 * SET information level codes
 */
consts.SET_INFO_STANDARD = 0x0001;  // Set creation, access, and last write timestamps.
consts.SET_INFO_EAS = 0x0002; // Set a specific list of extended attributes (EAs).
consts.SET_FILE_BASIC_INFO = 0x0101;  // Set 64-bit create, access, write, and change timestamps along with extended file attributes. Not supported for TRANS2_SET_PATH_INFORMATION (section 2.2.6.7).
consts.SET_FILE_DISPOSITION_INFO = 0x0102;  // Set whether or not the file is marked for deletion. Not supported for TRANS2_SET_PATH_INFORMATION (section 2.2.6.7).
consts.SET_FILE_ALLOCATION_INFO = 0x0103; // Set file allocation size. Not supported for TRANS2_SET_PATH_INFORMATION (section 2.2.6.7).
consts.SET_FILE_END_OF_FILE_INFO = 0x0104;  // Set file EOF offset. Not supported for TRANS2_SET_PATH_INFORMATION (section 2.2.6.7).

consts.SET_INFORMATION_LEVEL_TO_STRING = _.reduce(
  consts,
  function (result, val, nm) {
    if (nm.indexOf('SET_') === 0) {
      result[val] = nm;
    }
    return result
  },
  {}
);

/**
 * FIND flags
 */
consts.FIND_CLOSE_AFTER_REQUEST = 0x0001; // Close the search after this request.
consts.FIND_CLOSE_AT_EOS = 0x0002;  // Close search when end of search is reached.
consts.FIND_RETURN_RESUME_KEYS = 0x0004;  // Return resume keys for each entry found.
consts.FIND_CONTINUE_FROM_LAST = 0x0008;  // Continue search from previous ending place.
consts.FIND_WITH_BACKUP_INTENT = 0x0010;  // Find with backup intent.

/**
 * Completion filter
 */
consts.FILE_NOTIFY_CHANGE_FILE_NAME = 0x00000001;
consts.FILE_NOTIFY_CHANGE_DIR_NAME = 0x00000002;
consts.FILE_NOTIFY_CHANGE_NAME = 0x00000003;
consts.FILE_NOTIFY_CHANGE_ATTRIBUTES = 0x00000004;
consts.FILE_NOTIFY_CHANGE_SIZE = 0x00000008;
consts.FILE_NOTIFY_CHANGE_LAST_WRITE = 0x00000010;
consts.FILE_NOTIFY_CHANGE_LAST_ACCESS = 0x00000020;
consts.FILE_NOTIFY_CHANGE_CREATION = 0x00000040;
consts.FILE_NOTIFY_CHANGE_EA = 0x00000080;
consts.FILE_NOTIFY_CHANGE_SECURITY = 0x00000100;
consts.FILE_NOTIFY_CHANGE_STREAM_NAME = 0x00000200;
consts.FILE_NOTIFY_CHANGE_STREAM_SIZE = 0x00000400;
consts.FILE_NOTIFY_CHANGE_STREAM_WRITE = 0x00000800;

/**
 * Device type
 */
consts.FILE_DEVICE_DISK = 0x0007;
consts.FILE_DEVICE_DISK_FILE_SYSTEM = 0x0008;
consts.FILE_DEVICE_FILE_SYSTEM = 0x0009;
consts.FILE_DEVICE_NETWORK_FILE_SYSTEM = 0x0014;
consts.FILE_DEVICE_VIRTUAL_DISK = 0x0024;

/**
 * Device characteristics
 */
consts.FILE_READ_ONLY_DEVICE = 0x0002;
consts.FILE_REMOTE_DEVICE = 0x0010;
consts.FILE_DEVICE_IS_MOUNTED = 0x0020;
consts.FILE_VIRTUAL_VOLUME = 0x0040;

/**
 * File system attributes.
 */
consts.FILE_CASE_SENSITIVE_SEARCH = 0x00000001;
consts.FILE_CASE_PRESERVED_NAMES = 0x00000002;

/**
 * File attributes.
 */
consts.ATTR_READ_ONLY = 0x001;
consts.ATTR_HIDDEN = 0x002;
consts.ATTR_SYSTEM = 0x004;
consts.ATTR_VOLUME = 0x008;
consts.ATTR_DIRECTORY = 0x010;
consts.ATTR_ARCHIVE = 0x020;
consts.ATTR_NORMAL = 0x080;
consts.ATTR_TEMPORARY = 0x100;
consts.ATTR_COMPRESSED = 0x800;

/**
 * Create Disposition
 */
consts.FILE_SUPERSEDE = 0x00; // (No bits set.)If the file already exists, it SHOULD be superseded (overwritten). If it does not already exist, then it SHOULD be created.
consts.FILE_OPEN = 0x01;  // If the file already exists, it SHOULD be opened rather than created. If the file does not already exist, the operation MUST fail.
consts.FILE_CREATE = 0x02;  // If the file already exists, the operation MUST fail. If the file does not already exist, it SHOULD be created.
consts.FILE_OPEN_IF = 0x03; // If the file already exists, it SHOULD be opened. If the file does not already exist, then it SHOULD be created. This value is equivalent to (FILE_OPEN | FILE_CREATE).
consts.FILE_OVERWRITE = 0x04; // If the file already exists, it SHOULD be opened and truncated. If the file does not already exist, the operation MUST fail. The client MUST open the file with at least GENERIC_WRITE access for the command to succeed.
consts.FILE_OVERWRITE_IF = 0x05;  // If the file already exists, it SHOULD be opened and truncated. If the file does not already exist, it SHOULD be created. The client MUST open the file with at least GENERIC_WRITE access.

/**
 * Open Function
 */
consts.OPEN_FUNCTION_OPEN = 0x001;
consts.OPEN_FUNCTION_TRUNCATE = 0x002;
consts.OPEN_FUNCTION_CREATE = 0x010;

/**
 * Open Action
 */
consts.OPEN_ACTION_EXISTED = 1;
consts.OPEN_ACTION_CREATED = 2;
consts.OPEN_ACTION_TRUNCATED = 3;

/**
 * Create Options
 */
consts.FILE_DIRECTORY_FILE = 0x00000001;  // The file being created or opened is a directory file.
consts.FILE_WRITE_THROUGH = 0x00000002;
consts.FILE_SEQUENTIAL_ONLY = 0x00000004;
consts.FILE_NO_INTERMEDIATE_BUFFERING = 0x00000008;
consts.FILE_SYNCHRONOUS_IO_ALERT = 0x00000010;
consts.FILE_SYNCHRONOUS_IO_NONALERT = 0x00000020;
consts.FILE_NON_DIRECTORY_FILE = 0x00000040;  // If the file being opened is a directory, the server MUST fail the request with STATUS_FILE_IS_A_DIRECTORY in the Status field of the SMB Header in the server response.
consts.FILE_CREATE_TREE_CONNECTION = 0x00000080;
consts.FILE_COMPLETE_IF_OPLOCKED = 0x00000100;
consts.FILE_NO_EA_KNOWLEDGE = 0x00000200;
consts.FILE_OPEN_FOR_RECOVERY = 0x00000400;
consts.FILE_RANDOM_ACCESS = 0x00000800;
consts.FILE_DELETE_ON_CLOSE = 0x00001000; // The file SHOULD be automatically deleted when the last open request on this file is closed. When this option is set, the DesiredAccess field MUST include the DELETE flag. This option is often used for temporary files.
consts.FILE_OPEN_BY_FILE_ID = 0x00002000;
consts.FILE_OPEN_FOR_BACKUP_INTENT = 0x00004000;
consts.FILE_NO_COMPRESSION = 0x00008000;
consts.FILE_RESERVE_OPFILTER = 0x00100000;
consts.FILE_OPEN_NO_RECALL = 0x00400000;
consts.FILE_OPEN_FOR_FREE_SPACE_QUERY = 0x00800000;

/**
 * Desired Access
 */
consts.FILE_READ_DATA = 0x00000001;  // Indicates the right to read data from the file.
consts.FILE_WRITE_DATA = 0x00000002;  // Indicates the right to write data into the file beyond the end of the file.
consts.FILE_APPEND_DATA = 0x00000004; // Indicates the right to append data to the file beyond the end of the file only.
consts.FILE_READ_EA = 0x00000008; // Indicates the right to read the extended attributes (EAs) of the file.
consts.FILE_WRITE_EA = 0x00000010;  // Indicates the right to write or change the extended attributes (EAs) of the file.
consts.FILE_EXECUTE = 0x00000020; // Indicates the right to execute the file.
consts.FILE_READ_ATTRIBUTES = 0x00000080; // Indicates the right to read the attributes of the file.
consts.FILE_WRITE_ATTRIBUTES = 0x00000100; // Indicates the right to change the attributes of the file.
consts.DELETE = 0x00010000; // Indicates the right to delete or to rename the file.
consts.READ_CONTROL = 0x00020000; // Indicates the right to read the security descriptor of the file.
consts.WRITE_DAC = 0x00040000;  // Indicates the right to change the discretionary access control list (DACL) in the security descriptor of the file.
consts.WRITE_OWNER = 0x00080000;  // Indicates the right to change the owner in the security descriptor of the file.
consts.SYNCHRONIZE = 0x00100000;  // SHOULD NOT be used by the sender and MUST be ignored by the receiver.
consts.ACCESS_SYSTEM_SECURITY = 0x01000000; // Indicates the right to read or change the system access control list (SACL) in the security descriptor for the file. If the SE_SECURITY_NAME privilege is not set in the access token, the server MUST fail the open request and return STATUS_PRIVILEGE_NOT_HELD.
consts.MAXIMUM_ALLOWED = 0x02000000;  // Indicates that the client requests an open to the file with the highest level of access that the client has on this file. If no access is granted for the client on this file, the server MUST fail the open and return a STATUS_ACCESS_DENIED.
consts.GENERIC_ALL = 0x10000000;  // Indicates a request for all of the access flags that are previously listed except MAXIMUM_ALLOWED and ACCESS_SYSTEM_SECURITY.
consts.GENERIC_EXECUTE = 0x20000000;  // Indicates a request for the following combination of access flags listed previously in this table: FILE_READ_ATTRIBUTES, FILE_EXECUTE, SYNCHRONIZE, and READ_CONTROL.
consts.GENERIC_WRITE = 0x40000000;  // Indicates a request for the following combination of access flags listed previously in this table: FILE_WRITE_DATA, FILE_APPEND_DATA, SYNCHRONIZE, FILE_WRITE_ATTRIBUTES, and FILE_WRITE_EA.
consts.GENERIC_READ = 0x80000000; // Indicates a request for the following combination of access flags listed previously in this table:  FILE_READ_DATA, FILE_READ_ATTRIBUTES, FILE_READ_EA, and SYNCHRONIZE.

/**
 * Share Access
 */
consts.FILE_SHARE_NONE = 0x00000000;  // (No bits set.)Prevents the file from being shared.
consts.FILE_SHARE_READ = 0x00000001;  // Other open operations can be performed on the file for read access.
consts.FILE_SHARE_WRITE = 0x00000002; // Other open operations can be performed on the file for write access.
consts.FILE_SHARE_DELETE = 0x00000004;  // Other open operations can be performed on the file for delete access.

/**
 * Lock types
 */
consts.READ_WRITE_LOCK = 0x00; // Request for an exclusive read and write lock.
consts.SHARED_LOCK = 0x01; // Request for a shared read-only lock.
consts.OPLOCK_RELEASE = 0x02;  // When sent from the server to the client in an OpLock Break Notification, this bit indicates to the client that an OpLock change has occurred on the FID supplied in the request. The client MUST set this bit when sending the OpLock Break Request message acknowledging the OpLock Break.
consts.CHANGE_LOCKTYPE = 0x04; // Request to atomically change the lock type from a shared lock to an exclusive lock or vice versa for the specified Locks.<39>
consts.CANCEL_LOCK = 0x08; // Request to cancel all outstanding lock requests for the specified FID and PID.<40>
consts.LARGE_FILES = 0x10; // Indicates that the LOCKING_ANDX_RANGE format is the 64-bit file offset version. If this flag is not set, then the LOCKING_ANDX_RANGE format is the 32-bit file offset version.

/**
 * Write Mode
 */
consts.WritethroughMode = 0x0001; // If set the server MUST NOT respond to the client before the data is written to disk (write-through).
consts.ReadBytesAvailable = 0x0002; // If set the server SHOULD set the Response.SMB_Parameters.Available field correctly for writes to named pipes or I/O devices.
consts.RAW_MODE = 0x0004; // Applicable to named pipes only. If set, the named pipe MUST be written to in raw mode (no translation).
consts.MSG_START = 0x0008;  // Applicable to named pipes only. If set, this data is the start of a message.

/**
 * Status
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
    return result
  },
  {}
);

/**
 * security mode
 */
consts.NEGOTIATE_USER_SECURITY = 0x01;
consts.NEGOTIATE_ENCRYPT_PASSWORDS = 0x02;  // challenge/response
consts.NEGOTIATE_SECURITY_SIGNATURES_ENABLED = 0x04;
consts.NEGOTIATE_SECURITY_SIGNATURES_REQUIRED = 0x08;

module.exports = consts;