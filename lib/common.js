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
 * Common/protocol-neutral constants (i.e. applicable to multiple SMB protocol versions)
 */

consts.NATIVE_LANMAN = 'node-smb-server';

/**
 * dialects
 */
consts.DIALECT_NT_LM_0_12 = 'NT LM 0.12'; // the currently supported dialect (CIFS)
consts.DIALECT_SMB_2_002 = 'SMB 2.002';
consts.DIALECT_SMB_2_X = 'SMB 2.???';

/**
 * File attributes (MS-FSCC, 2.6)
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
 * file actions used in FileNotifyInformation (MS-FSCC, 2.4.42)
 */
consts.FILE_ACTION_ADDED = 0x00000001;
consts.FILE_ACTION_REMOVED = 0x0000002;
consts.FILE_ACTION_MODIFIED = 0x0000003;
consts.FILE_ACTION_RENAMED_OLD_NAME = 0x0000004;
consts.FILE_ACTION_RENAMED_NEW_NAME = 0x0000005;
consts.FILE_ACTION_ADDED_STREAM = 0x0000006;
consts.FILE_ACTION_REMOVED_STREAM = 0x0000007;
consts.FILE_ACTION_MODIFIED_STREAM = 0x0000008;

consts.FILE_ACTION_RENAMED = 0x0000100;

consts.FILE_ACTION_TO_STRING = _.reduce(
  consts,
  function (result, val, nm) {
    if (nm.indexOf('FILE_ACTION_') === 0) {
      result[val] = nm;
    }
    return result;
  },
  {}
);

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
 * Create Action
 */
consts.FILE_SUPERSEDED = 0x00000000;  // An existing file was deleted and a new file was created in its place.
consts.FILE_OPENED = 0x00000001; // An existing file was opened.
consts.FILE_CREATED = 0x00000002; // A new file was created.
consts.FILE_OVERWRITTEN = 0x00000003; // An existing file was overwritten.

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

module.exports = consts;
