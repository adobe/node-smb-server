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

var consts = require('./constants');

function decode(flags) {
  return {
    reply: !!(flags & consts.FLAGS_SERVER_TO_REDIR),
    async: !!(flags & consts.FLAGS_ASYNC_COMMAND),
    relatedOp: !!(flags & consts.FLAGS_RELATED_OPERATIONS),
    signed: !!(flags & consts.FLAGS_SIGNED),
    dfsOp: !!(flags & consts.FLAGS_DFS_OPERATIONS),
    replayOp: !!(flags & consts.FLAGS_REPLAY_OPERATION),
    priorityMask: (flags & consts.FLAGS_PRIORITY_MASK)
  };
}

function encode(flgs) {
  var flags = 0x00000000;
  if (!flgs) {
    return flags;
  }

  flags = (flgs.reply ? consts.FLAGS_SERVER_TO_REDIR : 0)
    | (flgs.async ? consts.FLAGS_ASYNC_COMMAND : 0)
    | (flgs.relatedOp ? consts.FLAGS_RELATED_OPERATIONS : 0)
    | (flgs.signed ? consts.FLAGS_SIGNED : 0)
    | (flgs.dfsOp ? consts.FLAGS_DFS_OPERATIONS : 0)
    | (flgs.replayOp ? consts.FLAGS_REPLAY_OPERATION : 0)
    | flgs.priorityMask;

  return flags;
}

module.exports.encode = encode;
module.exports.decode = decode;
