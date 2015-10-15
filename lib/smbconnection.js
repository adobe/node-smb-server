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

var logger = require('winston');
var fs = require('fs');
var path = require('path');
var async = require('async');

var consts = require('./constants');
var utils = require('./utils');
var message = require('./smb/message');

var cmdHandlers = {};

function loadCmdHandlers() {
  var p = path.join(__dirname, 'smb', 'cmd');
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
 * Creates an <code>SMBConnection</code> instance. This objects takes care of reading and writing
 * SMB messages on the wire and delegating the message processing to specialised handlers.
 *
 * @param {Socket} socket - tcp socket
 * @param {Object} server - smb server
 * @constructor
 */
function SMBConnection(socket, server) {
  this.socket = socket;
  this.server = server;

  this.socket.on('data', this.onData.bind(this));
  this.socket.on('close', this.onClose.bind(this));
}

SMBConnection.prototype.onData = function (buf) {
  logger.silly('received %d bytes: %s', buf.length, buf.toString('hex'));

  var msgChunks = [];
  while (buf.length >= 4 + consts.SMB_MIN_LENGTH) {
    // parse NetBIOS session service header (RFC 1002)
    var nbType = buf.readUInt8(0);
    // since we're assuming native SMB (i.e. over TCP)
    // we're only supporting NetBIOS session messages
    if (nbType != 0x00) {
      logger.error('unsupported NetBIOS session service message type: %d', nbType);
      this.socket.destroy();
      return;
    }

    // native SMB message headers consist of 8-bit type and 24-bit length;
    // since type is 0 we can read the length as 32-bit unsigned int.
    // (NetBIOS uses big-endian (network) byte order)
    var smbLen = buf.readUInt32BE(0);
    buf = buf.slice(4);

    // validate length
    if (smbLen < consts.SMB_MIN_LENGTH || smbLen > consts.SMB_MAX_LENGTH) {
      logger.error('SMBHeader length outside range [%d,%d]: %d, data: %s', consts.SMB_MIN_LENGTH, consts.SMB_MAX_LENGTH, smbLen, buf.toString('hex'));
      // todo send smb error?
      this.socket.destroy();
      return;
    }

    if (smbLen > buf.length) {
      logger.error('encountered corrupted msg: actual length: %d, expected length: %d, data: %s', buf.length, smbLen, buf.toString('hex'));
      // todo send smb error?
      this.socket.destroy();
      return;
    }

    msgChunks.push(buf.slice(0, smbLen));

    buf = buf.slice(smbLen);
  }
  // by now we should have consumed all msg chunks
  if (buf.length) {
    logger.warn('encountered corrupted msg: actual length: %d, expected length: >= %d, data: %s', buf.length, 4 + consts.SMB_MIN_LENGTH, buf.toString('hex'));
    // todo need to store partial msg chunk and prepend on next data event?
    this.socket.destroy();
  }

  var self = this;
  var msgs = [];
  msgChunks.forEach(function (chunk) {
    // parse raw message
    msgs.push(message.decode(chunk));
  });

  // todo process messages with different msg.header.mid in parallel?
  async.eachSeries(msgs,
    function (msg, callback) {
      // process message
      self.processMessage(msg, callback);
    }
  );
};

SMBConnection.prototype.onClose = function (hadErrors) {
  // todo cleanup connection state
};

SMBConnection.prototype.processMessage = function (msg, cb) {
  // invoke async command handlers
  var self = this;
  async.eachSeries(msg.commands,
    function (cmd, callback) {
      var command = consts.COMMAND_TO_STRING[cmd.commandId];
      if (!command) {
        self.sendErrorResponse(msg, consts.STATUS_SMB_BAD_COMMAND, function () {
          callback('encountered invalid command 0x' + cmd.commandId.toString(16));
        });
        return;
      }
      var handler = cmdHandlers[command];
      if (handler) {
        handler(msg, cmd.commandId, cmd.params, cmd.data, cmd.paramsOffset, cmd.dataOffset, self, self.server, function (result) {
          if (!result) {
            // special case (see e.g. 'echo' handler): no further processing required
            callback();
            return;
          }
          if (result.status === consts.STATUS_SUCCESS) {
            // stash andX command result
            cmd.params = result.params;
            cmd.data = result.data;
            callback();
          } else {
            self.sendErrorResponse(msg, result.status, function () {
              callback('\'' + command + '\' returned error status 0x' + result.status.toString(16));
            });
          }
        });
      } else {
        var errMsg = 'encountered unsupported command 0x' + cmd.commandId.toString(16) + ' \'' + command + '\'';
        logger.error(errMsg);
        self.sendErrorResponse(msg, consts.STATUS_NOT_IMPLEMENTED, function () {
          callback(errMsg);
        });
      }
    },
    function (err) {
      if (err) {
        cb(err);
        return;
      }
      self.sendResponse(msg, cb);
      // we're done
      //cb();
    }
  );
};

SMBConnection.prototype.sendResponse = function (msg, cb) {
  // make sure the 'reply' flag is set
  msg.header.flags.reply = true;
  // todo set other default flags?
  msg.header.flags.unicode = true;
  msg.header.flags.pathnames.long.supported = true;

  msg.header.status = consts.STATUS_SUCCESS;

  var msgBuf = message.encode(msg);
  var hdrBuf = new Buffer(4);
  // native SMB message headers consist of 8-bit type and 24-bit length;
  // since NetBIOS session message type is 0 we can write the length as 32-bit unsigned int.
  // (NetBIOS uses big-endian (network) byte order)
  hdrBuf.writeUInt32BE(msgBuf.length, 0);
  this.socket.write(Buffer.concat([ hdrBuf, msgBuf ]), cb);
};

SMBConnection.prototype.sendErrorResponse = function (msg, status, cb) {
  // make sure the 'reply' flag is set
  msg.header.flags.reply = true;
  msg.header.flags.ntStatus = true;
  msg.status = status;
  // according to the CIFS spec:
  // "Error responses SHOULD be sent with empty SMB Parameters and SMB Data blocks"
  msg.params = utils.EMPTY_BUFFER;
  msg.data = utils.EMPTY_BUFFER;

  var msgBuf = message.encode(msg);
  var hdrBuf = new Buffer(4);
  // native SMB message headers consist of 8-bit type and 24-bit length;
  // since NetBIOS session message type is 0 we can write the length as 32-bit unsigned int.
  // (NetBIOS uses big-endian (network) byte order)
  hdrBuf.writeUInt32BE(msgBuf.length, 0);
  this.socket.write(Buffer.concat([ hdrBuf, msgBuf ]), cb);
};

module.exports = SMBConnection;
