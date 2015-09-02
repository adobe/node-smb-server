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

var binary = require('binary');
var logger = require('winston');

var consts = require('./constants');
var unpack = require('./smb/unpack');

function SMBSocket(socket, server) {
  this.socket = socket;
  this.server = server;

  this.socket.on('data', this.onData.bind(this));
  this.socket.on('end', this.onEnd.bind(this));
  this.socket.on('error', this.onError.bind(this));
  this.socket.on('close', this.onClose.bind(this));
}

SMBSocket.prototype.onData = function (buf) {
  logger.debug('received %d bytes: [%s]', buf.length, buf.toString('hex'));

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
  var len = buf.readUInt32BE(0);

  // validate length
  if (len < consts.SMB_MIN_LENGTH || len > consts.SMB_MAX_LENGTH) {
    logger.warn('SMBHeader length outside range [%d,%d]: %d', consts.SMB_MIN_LENGTH, consts.SMB_MAX_LENGTH, len);
    this.socket.destroy();
  }

  if (len + 4 != buf.length) {
    logger.error('encountered corrupted msg: actual length: %d, expected length: %d, data: [%s]', buf.length - 4, len, buf.slice(4).toString('hex'));
    // todo handle gracefully
    this.socket.destroy();
  }
  // parse msg
  var msg = unpack(buf.slice(4));
  console.log(msg);
  // todo handle msg
};

SMBSocket.prototype.onEnd = function () {
  // todo cleanup connection state
};

SMBSocket.prototype.onError = function (err) {
  logger.error(err);
};

SMBSocket.prototype.onClose = function (hadErrors) {
  logger.info('socket closed');
};

module.exports = SMBSocket;

