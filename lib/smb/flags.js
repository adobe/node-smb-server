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

var consts = require('./constants');

function decode(flags, flags2) {
  return {
    reply: !!(flags & consts.FLAGS_REPLY),
    oplock: {
      enabled: !!(flags & consts.FLAGS_OPLOCK),
      batch: !!(flags & consts.FLAGS_BATCH_OPLOCK)
    },
    pathnames: {
      canonical: !!(flags & consts.FLAGS_CANONICAL_PATHNAMES),
      caseless: !!(flags & consts.FLAGS_CASELESS_PATHNAMES),
      long: {
        enabled: !!(flags2 & consts.FLAGS2_IS_LONG_NAME),
        supported: !!(flags2 & consts.FLAGS2_KNOWS_LONG_NAMES),
      },
      dfs: !!(flags2 & consts.FLAGS2_DFS_PATHNAMES)
    },
    lockread: !!(flags & consts.FLAGS_SUPPORT_LOCKREAD),
    unicode: !!(flags2 & consts.FLAGS2_UNICODE_STRINGS),
    ntStatus: !!(flags2 & consts.FLAGS2_STATUS),
    readIfExec: !!(flags2 & consts.FLAGS2_READ_IF_EXECUTE),
    security: {
      extended: !!(flags2 & consts.FLAGS2_EXTENDED_SECURITY),
      signature: {
        enabled: !!(flags2 & consts.FLAGS2_SECURITY_SIGNATURE),
        required: !!(flags2 & consts.FLAGS2_SECURITY_SIGNATURE_REQUIRED)
      }
    },
    eas: !!(flags2 & consts.FLAGS2_EAS)
  };
}

function encode(flgs) {
  var ret = {
    flags: 0x00,
    flags2: 0x0000
  };

  if (!flgs) {
    return ret;
  }

  ret.flags = (flgs.reply ? consts.FLAGS_REPLY : 0)
    | (flgs.oplock && flgs.oplock.enabled ? consts.FLAGS_OPLOCK : 0)
    | (flgs.oplock && flgs.oplock.batch ? consts.FLAGS_BATCH_OPLOCK : 0)
    | (flgs.pathnames && flgs.pathnames.canonical ? consts.FLAGS_CANONICAL_PATHNAMES : 0)
    | (flgs.pathnames && flgs.pathnames.caseless ? consts.FLAGS_CASELESS_PATHNAMES : 0)
    | (flgs.lockread ? consts.FLAGS_SUPPORT_LOCKREAD : 0);

  ret.flags2 = (flgs.pathnames && flgs.pathnames.long && flgs.pathnames.long.enabled ? consts.FLAGS2_IS_LONG_NAME : 0)
    | (flgs.pathnames && flgs.pathnames.long && flgs.pathnames.long.supported ? consts.FLAGS2_KNOWS_LONG_NAMES : 0)
    | (flgs.pathnames && flgs.pathnames.dfs ? consts.FLAGS2_DFS_PATHNAMES : 0)
    | (flgs.unicode ? consts.FLAGS2_UNICODE_STRINGS : 0)
    | (flgs.ntStatus ? consts.FLAGS2_STATUS : 0)
    | (flgs.readIfExec ? consts.FLAGS2_READ_IF_EXECUTE : 0)
    | (flgs.security && flgs.security.extended ? consts.FLAGS2_EXTENDED_SECURITY : 0)
    | (flgs.security && flgs.security.signature && flgs.security.signature.enabled ? consts.FLAGS2_SECURITY_SIGNATURE : 0)
    | (flgs.security && flgs.security.signature && flgs.security.signature.required ? consts.FLAGS2_SECURITY_SIGNATURE_REQUIRED : 0)
    | (flgs.eas ? consts.FLAGS2_EAS : 0);

  return ret;
}

module.exports.encode = encode;
module.exports.decode = decode;
