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

var fs = require('fs');
var path = require('path');

var logger = require('winston').loggers.get('smb');
var put = require('put');
var async = require('async');

var utils = require('../utils');
var ntstatus = require('../ntstatus');
var message = require('./message');
var SMB2 = require('./constants');

var cmdHandlers = {};

function loadCmdHandlers() {
  var p = path.join(__dirname, 'cmd');
  var files = fs.readdirSync(p);
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var stat = fs.statSync(path.resolve(p, f));
    if (stat.isDirectory()) {
      continue;
    }
    if (f.substr(-3) === '.js') {
      f = f.slice(0, -3);
      cmdHandlers[f] = require(path.resolve(p, f));
    }
  }
}
loadCmdHandlers();

var out = put();
out.word16le(0x0009)  // StructureSize (fixed according to spec)
  .word8(0)  // ErrorContextCount
  .pad(1) // Reserved
  .word32le(0)  // ByteCount
  .word8(0);  // ErrorData
var SMBERROR_BODY = out.buffer();

/**
 * Handles binary SMB 2.x/3.x messages
 *
 * @param {Buffer} msgBuf - raw message buffer
 * @param {SMBConnection} connection - an SMBConnection instance
 * @param {SMBServer} server - an SMBServer instance
 * @param {Function} cb callback called on completion
 */
function handleRequest(msgBuf, connection, server, cb) {
  var buf = msgBuf;
  // dissect compounded requests
  var compMsgs = [];
  var msg = message.decode(buf);
  compMsgs.push(msg);
  while (msg.header.nextCommand) {
    buf = buf.slice(msg.header.nextCommand);
    msg = message.decode(buf);
    compMsgs.put(msg);
  }

  if (compMsgs[0].header.relatedOp) {
    sendResponse(compMsgs[0], ntstatus.STATUS_INVALID_PARAMETER, cb);
    return;
  }

  var relatedOps = compMsgs.length > 1 && compMsgs[1].header.relatedOp;

  // context for related operations
  var relatedCtx = relatedOps ? {
    sessionId: compMsgs[0].sessionId,
    treeId: compMsgs[0].treeId,
    fileId: null
  } : null;

  function processMsg(msg, callback) {
    var command = SMB2.COMMAND_TO_STRING[msg.header.commandId];
    if (!command) {
      // unknown command
      callback({
        status: ntstatus.STATUS_SMB_BAD_COMMAND,
        message: 'encountered invalid command 0x' + msg.header.ommandId.toString(16)
      });
    }
    var handler = cmdHandlers[command];
    if (handler) {
      // process command
      handler(msg, msg.header.commandId, msg.body, relatedCtx, connection, server, function (result) {
        if (!result) {
          // special case (see e.g. 'echo' handler): no further processing required
          msg.processed = true;
        } else {
          if (result.status !== ntstatus.STATUS_SUCCESS) {
            // command failed
            logger.debug('\'' + command.toUpperCase() + '\' returned error status ' + ntstatus.STATUS_TO_STRING[result.status] + ' (0x' + result.status.toString(16) + ')');
          }
          // stash command result/response
          msg.header.status = result.status;
          msg.body = result.body;
        }
        callback();
      });
    } else {
      // no handler found
      logger.error('encountered unsupported command 0x' + msg.header.commandId.toString(16) + ' \'' + command.toUpperCase() + '\'');
      msg.header.status = ntstatus.STATUS_NOT_IMPLEMENTED;
      msg.body = SMBERROR_BODY;
      callback();
    }
  }

  function processResults(err) {
    sendCompoundedResponses(compMsgs, connection, server, cb);
  }

  // invoke async command handlers
  if (relatedOps) {
    async.eachSeries(compMsgs,
      processMsg,
      processResults
    );
  } else {
    async.each(compMsgs,
      processMsg,
      processResults
    );
  }
}

function sendCompoundedResponses(msgs, connection, server, cb) {
  var out = put();

  if (msgs.length === 1 && msgs[0].processed) {
    // special case (see e.g. 'echo' handler): no further processing required
    cb();
    return;
  }

  // build compounded responses
  msgs.forEach(function (msg, n, arr) {
    // make sure the 'reply' flag is set
    msg.header.flags.reply = true;
    if (msg.header.status !== ntstatus.STATUS_SUCCESS) {
      msg.body = SMBERROR_BODY;
    }
    // calculate nextCommand offset
    var nextCommandOff = 0;
    var padLength = 0;
    if (n < arr.length - 1) {
      nextCommandOff = SMB2.HEADER_LENGTH + msg.body.length;
      // align nextCommand on 8-byte boundary
      padLength = utils.calculatePadLength(nextCommandOff, 8);
      nextCommandOff += padLength;
    }
    msg.header.nextCommand = nextCommandOff;
    out.put(message.encode(msg));
    if (padLength) {
      out.pad(padLength);
    }
  });

  connection.sendRawMessage(out.buffer(), cb);
}

function sendResponse(msg, status, connection, server, cb) {
  // make sure the 'reply' flag is set
  msg.header.flags.reply = true;
  msg.header.status = status;
  msg.header.nextCommand = 0;

  if (status !== ntstatus.STATUS_SUCCESS) {
    msg.body = SMBERROR_BODY;
  }

  connection.sendRawMessage(message.encode(msg), cb);
}

module.exports.handleRequest = handleRequest;
module.exports.sendResponse = sendResponse;
