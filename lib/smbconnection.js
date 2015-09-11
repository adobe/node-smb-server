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

var consts = require('./constants');
var message = require('./smb/message');

var cmdHandlers = {};

var EMPTY_BUFFER = new Buffer(0);

function loadCmdHandlers() {
  var p = path.join(__dirname, 'smb', 'cmd');
  var files = fs.readdirSync(p);
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.substr(-3) === '.js') {
      f = f.slice(0, -3);
    }
    cmdHandlers[f] = require(path.join(p, f));
  }
}
loadCmdHandlers();

function SMBConnection(socket, server) {
  this.socket = socket;
  this.server = server;

  this.socket.on('data', this.onData.bind(this));
  this.socket.on('end', this.onEnd.bind(this));
  this.socket.on('error', this.onError.bind(this));
  this.socket.on('close', this.onClose.bind(this));
}

SMBConnection.prototype.onData = function (buf) {
  logger.debug('received %d bytes: %s', buf.length, buf.toString('hex'));

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

  msgChunks.forEach(function (chunk) {
    // parse raw message
    var msg = message.decode(chunk);

    while (msg) {
      // delegate to specific command handler
      var handler = cmdHandlers[msg.header.command];
      if (handler) {
        handler(msg, this, this.server);
      } else {
        if (!msg.header.command) {
          logger.error('encountered invalid command 0x%s', msg.header.commandId.toString(16));
          this.sendErrorResponse(msg, consts.STATUS_SMB_BAD_COMMAND);
        } else {
          logger.warn('encountered unsupported command 0x%s \'%s\'', msg.header.commandId.toString(16), msg.header.command);
          this.sendErrorResponse(msg, consts.STATUS_NOT_IMPLEMENTED);
        }
      }
      msg = msg.next;
    }
  }, this);

};

SMBConnection.prototype.sendResponse = function (msg) {
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
  hdrBuf.writeUInt32BE(msgBuf.length);
  //this.socket.write(Buffer.concat([ hdrBuf, msgBuf ]));
  this.socket.write(hdrBuf);
  this.socket.write(msgBuf);
};

SMBConnection.prototype.sendErrorResponse = function (msg, status) {
  // make sure the 'reply' flag is set
  msg.header.flags.reply = true;
  msg.header.flags.ntStatus = true;
  msg.status = status;
  msg.params = EMPTY_BUFFER;
  msg.data = EMPTY_BUFFER;

  var msgBuf = message.encode(msg);
  var hdrBuf = new Buffer(4);
  // native SMB message headers consist of 8-bit type and 24-bit length;
  // since NetBIOS session message type is 0 we can write the length as 32-bit unsigned int.
  // (NetBIOS uses big-endian (network) byte order)
  hdrBuf.writeUInt32BE(msgBuf.length);
  //this.socket.write(Buffer.concat([ hdrBuf, msgBuf ]));
  this.socket.write(hdrBuf);
  this.socket.write(msgBuf);
};

SMBConnection.prototype.onEnd = function () {
  // todo cleanup connection state
};

SMBConnection.prototype.onError = function (err) {
  logger.error(err);
};

SMBConnection.prototype.onClose = function (hadErrors) {
  logger.info('socket closed');
};

module.exports = SMBConnection;

