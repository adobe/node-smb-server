/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2016 Adobe Systems Incorporated
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
