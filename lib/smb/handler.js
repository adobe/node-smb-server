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

var fs = require('fs');
var path = require('path');

var logger = require('winston').loggers.get('smb');
var async = require('async');

var ntstatus = require('../ntstatus');
var message = require('./message');
var SMB = require('./constants');

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
 * Handle binary CIFS/SMB 1.0 message
 *
 * @param {Buffer} msgBuf - raw message buffer
 * @param {SMBConnection} connection - an SMBConnection instance
 * @param {SMBServer} server - an SMBServer instance
 * @param {Function} cb callback called on completion
 */
function handleRequest(msgBuf, connection, server, cb) {

  // validate length
  if (msgBuf.length < SMB.SMB_MIN_LENGTH || msgBuf.length > SMB.SMB_MAX_LENGTH) {
    cb('SMBHeader length outside range [' + SMB.SMB_MIN_LENGTH + ',' + SMB.SMB_MAX_LENGTH + ']: ' + msgBuf.length + ', data: ' + msgBuf.toString('hex'));
    return;
  }

  var msg = message.decode(msgBuf);

  // invoke async command handlers
  async.eachSeries(msg.commands,
    function (cmd, callback) {
      var command = SMB.COMMAND_TO_STRING[cmd.commandId];
      if (!command) {
        // unknown command
        callback({
          status: ntstatus.STATUS_SMB_BAD_COMMAND,
          message: 'encountered invalid command 0x' + cmd.commandId.toString(16)
        });
      }
      var handler = cmdHandlers[command];
      if (handler) {
        // process command
        handler(msg, cmd.commandId, cmd.params, cmd.data, cmd.paramsOffset, cmd.dataOffset, connection, server, function (result) {
          if (!result) {
            // special case (see e.g. 'echo' handler): no further processing required
            msg.processed = true;
            callback();
          } else if (result.status === ntstatus.STATUS_SUCCESS) {
            // command succeeded: stash command result
            cmd.params = result.params;
            cmd.data = result.data;
            callback();
          } else {
            // command failed
            callback({
              status: result.status,
              message: '\'' + command.toUpperCase() + '\' returned error status ' + ntstatus.STATUS_TO_STRING[result.status] + ' (0x' + result.status.toString(16) + ')'
            });
          }
        });
      } else {
        // no handler found
        callback({
          status: ntstatus.STATUS_NOT_IMPLEMENTED,
          message: 'encountered unsupported command 0x' + cmd.commandId.toString(16) + ' \'' + command.toUpperCase() + '\''
        });
      }
    },
    function (err) {
      if (err) {
        if (err.status === ntstatus.STATUS_NOT_IMPLEMENTED) {
          logger.error(err.message);
        } else {
          logger.debug(err.message);
        }
        sendResponse(msg, err.status, connection, server, cb);
        return;
      }
      if (msg.processed) {
        // special case (see e.g. 'echo' handler): no further processing required
        cb();
        return;
      }
      sendResponse(msg, ntstatus.STATUS_SUCCESS, connection, server, cb);
    }
  );
}

function sendResponse(msg, status, connection, server, cb) {
  // make sure the 'reply' flag is set
  msg.header.flags.reply = true;
  msg.header.flags.ntStatus = true;
  // todo set other default flags?
  msg.header.flags.unicode = true;
  msg.header.flags.pathnames.long.supported = true;

  msg.header.status = status;

  connection.sendRawMessage(message.encode(msg), cb);
}

module.exports.handleRequest = handleRequest;
module.exports.sendResponse = sendResponse;
