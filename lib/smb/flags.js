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

var FLAGS_REPLY = 1 << 7;
var FLAGS_BATCH_OPLOCK = 1 << 6;
var FLAGS_OPLOCK = 1 << 5;
var FLAGS_CANONICAL_PATHNAMES = 1 << 4;
var FLAGS_CASELESS_PATHNAMES = 1 << 3;
// bit 2 reserved
// bit 1 only applies to NetBEUI which we are not supporting
var FLAGS_SUPPORT_LOCKREAD = 1 << 0;

var FLAGS2_UNICODE_STRINGS = 1 << 15;
var FLAGS2_STATUS = 1 << 14;
var FLAGS2_READ_IF_EXECUTE = 1 << 13;
var FLAGS2_DFS_PATHNAMES = 1 << 12;
var FLAGS2_EXTENDED_SECURITY = 1 << 11;
// bit 10 reserved
// bit 9 reserved
// bit 8 reserved
// bit 7 reserved
var FLAGS2_IS_LONG_NAME = 1 << 6;
// bit 5 reserved
var FLAGS2_SECURITY_SIGNATURE_REQUIRED = 1 << 4;
// bit 3 reserved
var FLAGS2_SECURITY_SIGNATURE = 1 << 2;
var FLAGS2_EAS = 1 << 1;
var FLAGS2_KNOWS_LONG_NAMES = 1 << 0;

function decode(flags, flags2) {
  var flgs = {
    reply: !!(flags & FLAGS_REPLY),
    oplock: {
      enabled: !!(flags & FLAGS_OPLOCK),
      batch: !!(flags & FLAGS_BATCH_OPLOCK)
    },
    pathnames: {
      canonical: !!(flags & FLAGS_CANONICAL_PATHNAMES),
      caseless: !!(flags & FLAGS_CASELESS_PATHNAMES),
      long: {
        enabled: !!(flags2 & FLAGS2_IS_LONG_NAME),
        supported: !!(flags2 & FLAGS2_KNOWS_LONG_NAMES),
      },
      dfs: !!(flags2 & FLAGS2_DFS_PATHNAMES)
    },
    lockread: !!(flags & FLAGS_SUPPORT_LOCKREAD),
    unicode: !!(flags2 & FLAGS2_UNICODE_STRINGS),
    status: (flags2 & FLAGS2_STATUS) ? 'NT' : 'DOS',
    readIfExec: !!(flags2 & FLAGS2_READ_IF_EXECUTE),
    security: {
      extended: !!(flags2 & FLAGS2_EXTENDED_SECURITY),
      signature: {
        enabled: !!(flags2 & FLAGS2_SECURITY_SIGNATURE),
        required: !!(flags2 & FLAGS2_SECURITY_SIGNATURE_REQUIRED)
      }
    },
    eas: !!(flags2 & FLAGS2_EAS)
  };

  return flgs;
}

function encode(flgs) {
  var ret = {
    flags: 0x00,
    flags2: 0x0000
  };

  ret.flags = (flgs.reply ? FLAGS_REPLY : 0)
    | (flgs.oplock.enabled ? FLAGS_OPLOCK : 0)
    | (flgs.oplock.batch ? FLAGS_BATCH_OPLOCK : 0)
    | (flgs.pathnames.canonical ? FLAGS_CANONICAL_PATHNAMES : 0)
    | (flgs.pathnames.caseless ? FLAGS_CASELESS_PATHNAMES : 0)
    | (flgs.lockread ? FLAGS_SUPPORT_LOCKREAD : 0);

  ret.flags2 = (flgs.pathnames.long.enabled ? FLAGS2_IS_LONG_NAME : 0)
    | (flgs.pathnames.long.supported ? FLAGS2_KNOWS_LONG_NAMES : 0)
    | (flgs.pathnames.dfs ? FLAGS2_DFS_PATHNAMES : 0)
    | (flgs.unicode ? FLAGS2_UNICODE_STRINGS : 0)
    | (flgs.status === 'NT' ? FLAGS2_STATUS : 0)
    | (flgs.readIfExec ? FLAGS2_READ_IF_EXECUTE : 0)
    | (flgs.security.extended ? FLAGS2_EXTENDED_SECURITY : 0)
    | (flgs.security.signature.enabled ? FLAGS2_SECURITY_SIGNATURE : 0)
    | (flgs.security.signature.required ? FLAGS2_SECURITY_SIGNATURE_REQUIRED : 0)
    | (flgs.eas ? FLAGS2_EAS : 0);

  return ret;
}

module.exports.encode = encode;
module.exports.decode = decode;
