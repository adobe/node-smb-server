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
var errno = require('errno');

var consts = require('./constants');

/**
 * Represents an SMB Error.
 *
 * @param {Number} status
 * @param {String} [message]
 * @constructor
 */
function SMBError(status, message) {
  this.status = status;
  this.message = message || consts.STATUS_TO_STRING[status] || 'unknown error';
}

SMBError.prototype.toString = function () {
  return '[' + this.status + ']' + this.message;
};

SMBError.fromSystemError = function (err) {
  var status = consts.STATUS_UNSUCCESSFUL;
  var msg = err.message || consts.STATUS_TO_STRING[status] || 'unknown error';

  /**
   * err.syscall
   * err.errno
   * err.code
   * err.path
   */

  if (err.errno && errno.errno[err.errno]) {
    msg = errno.errno[err.errno].description;
    if (err.path) {
      msg += ' [' + err.path + ']';
    }
    switch (err.code) {
      case errno.code.EINVAL:
        status = consts.STATUS_NOT_IMPLEMENTED;
        break;
      case errno.code.ENOENT:
        status = consts.STATUS_NO_SUCH_FILE;
        break;
      case errno.code.EPERM:
        status = consts.STATUS_ACCESS_DENIED;
        break;
      case errno.code.EBADF:
        //status = consts.STATUS_INVALID_HANDLE;
        status = consts.STATUS_SMB_BAD_FID;
        break;
      case errno.code.EEOF:
        status = consts.STATUS_END_OF_FILE;
        break;
      case errno.code.EEXIST:
        status = consts.STATUS_OBJECT_NAME_COLLISION;
        break;
      case errno.code.EACCES:
        status = consts.STATUS_NETWORK_ACCESS_DENIED;
        break;
    }
  }

  return new SMBError(status, msg);
};

SMBError.systemToSMBErrorTranslator = function (cb) {
  return function () {
    var args = [];
    if (arguments.length) {
      // first parameter of callback is the error parameter
      var err = arguments[0];
      args.push(err ? SMBError.fromSystemError(err) : null);
      for (var i = 1; i < arguments.length; i++) {
        args.push(arguments[i]);
      }
    }
    cb.apply(this, args);
  }
};

module.exports = SMBError;

