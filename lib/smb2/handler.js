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

var logger = require('winston').loggers.get('smb');
var fs = require('fs');
var path = require('path');

var async = require('async');

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

/**
 * Handles binary SMB 2.x/3.x messages
 *
 * @param {Buffer} msgBuf - raw message buffer
 * @param {SMBConnection} connection - an SMBConnection instance
 * @param {SMBServer} server - an SMBServer instance
 * @param {Function} cb callback called on completion
 */
function handleRequest(msgBuf, connection, server, cb) {
  var msg = message.decode(msgBuf);
  // todo decode compound messages
  // todo process message requests and send responses
  process.nextTick(function () { cb(); });
}

function sendResponse(msg, status, connection, server, cb) {
  // make sure the 'reply' flag is set
  msg.header.flags.reply = true;
  msg.header.status = status;

  connection.sendRawMessage(message.encode(msg), cb);
}

module.exports.handleRequest = handleRequest;
module.exports.sendResponse = sendResponse;
