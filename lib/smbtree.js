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
var async = require('async');

var SMBFile = require('./smbfile');
var consts = require('./constants');
var utils = require('./utils');

/**
 * Represents a tree connection established by <code>TREE_CONNECT_ANDX</code>
 *
 * @param {SMBServer} smbServer
 * @param {SMBShare} smbShare
 * @param {Tree} spiTree
 * @constructor
 */
function SMBTree(smbServer, smbShare, spiTree) {
  this.smbServer = smbServer;
  this.smbShare = smbShare;
  this.spiTree = spiTree;
  this.tid = ++SMBTree.tidCounter;

  switch (smbShare.getType()) {
    case consts.SHARE_TYPE_DISK:
      this.service = consts.SERVICE_DISKSHARE;
      break;
    case consts.SHARE_TYPE_PRINTER:
      this.service = consts.SERVICE_PRINTER;
      break;
    case consts.SHARE_TYPE_COMM:
      this.service = consts.SERVICE_COMM;
      break;
    case consts.SHARE_TYPE_IPC:
      this.service = consts.SERVICE_NAMEDPIPE;
      break;
    default:
      logger.warn('unexpected share type: %d', smbShare.getType());
      this.service = consts.SERVICE_ANY;
  }

  this.files = {};
}

SMBTree.tidCounter = 0;
SMBTree.fidCounter = 0;

SMBTree.prototype.getShare = function () {
  return this.smbShare;
};

SMBTree.prototype.getFile = function (fid) {
  return this.files[fid];
};

SMBTree.prototype.closeFile = function (fid, cb) {
  var file = this.files[fid];
  if (!file) {
    process.nextTick(function () { cb(new Error('no such file')); });
  } else {
    delete this.files[fid];
    file.close(cb);
  }
};

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
SMBTree.prototype.exists = function (name, cb) {
  this.spiTree.exists(utils.normalizeSMBFileName(name), cb);
};

/**
 * Open or create an existing file/directory.
 *
 * @param {String} name file name
 * @param {Number} createDisposition flag specifying action if file does/does not exist
 * @param {Boolean} openTargetDirectory true if target for open is a directory
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {SMBFile} cb.file opened file
 */
SMBTree.prototype.openOrCreate = function (name, createDisposition, openTargetDirectory, cb) {
  var self = this;

  name = utils.normalizeSMBFileName(name);

  function exists(callback) {
    self.exists(name, callback);
  }

  function createIf(exists, callback) {
    if (!exists) {
      if (createDisposition === consts.FILE_OPEN || createDisposition === consts.FILE_OVERWRITE) {
        callback({ message: 'not found', status: consts.STATUS_NO_SUCH_FILE });
        return;
      }
      if (openTargetDirectory) {
        self.createDirectory(name, function (err) { callback(err, true); });
      } else {
        self.createFile(name, function (err) { callback(err, true); });
      }
    } else {
      callback(null, false);
    }
  }

  function open(created, callback) {
    self.spiTree.open(name, function (err, file) {
      if (err) {
        callback(err);
        return;
      }
      var fid = ++SMBTree.fidCounter;
      var openAction = consts.OPEN_ACTION_EXISTED;
      if (created) {
        openAction = consts.OPEN_ACTION_CREATED;
      } else if (createDisposition === consts.FILE_OVERWRITE || createDisposition === consts.FILE_OVERWRITE_IF) {
        openAction = consts.OPEN_ACTION_TRUNCATED;
      }
      var result = new SMBFile(file, openAction, fid);
      self.files[fid] = result;
      if (openAction === consts.OPEN_ACTION_TRUNCATED) {
        result.setLength(0 , function (err) {
          callback(err, result);
        });
      } else {
        callback(null, result);
      }
    });
  }

  async.waterfall([
    exists,
    createIf,
    open
  ], cb);
};

/**
 * Open an existing file/directory.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {SMBFile} cb.file opened file
 */
SMBTree.prototype.open = function (name, cb) {
  var self = this;
  this.spiTree.open(utils.normalizeSMBFileName(name), function (err, file) {
    if (err) {
      cb(err);
    } else {
      var fid = ++SMBTree.fidCounter;
      var result = new SMBFile(file, consts.OPEN_ACTION_EXISTED, fid);
      self.files[fid] = result;
      cb(null, result);
    }
  });
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {SMBFile[]} cb.files array of matching files
 */
SMBTree.prototype.list = function (pattern, cb) {
  this.spiTree.list(utils.normalizeSMBFileName(pattern), function (err, files) {
    if (err) {
      cb(err);
    } else {
      var results = files.map(function (file) {
        return new SMBFile(file);
      });
      cb(null, results);
    }
  });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBTree.prototype.createFile = function (name, cb) {
  this.spiTree.createFile(utils.normalizeSMBFileName(name), cb);
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBTree.prototype.createDirectory = function (name, cb) {
  this.spiTree.createDirectory(utils.normalizeSMBFileName(name), cb);
};

/**
 * Delete a file or directory. If name denotes a directory, it must be
 * empty in order to be deleted.
 *
 * @param {String} name file or directory name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.deleted true if the file/directory could be deleted; false otherwise
 */
SMBTree.prototype.delete = function (name, cb) {
  this.spiTree.delete(utils.normalizeSMBFileName(name), cb);
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBTree.prototype.rename = function (oldName, newName, cb) {
  this.spiTree.rename(utils.normalizeSMBFileName(oldName), utils.normalizeSMBFileName(newName), cb);
};

/**
 * Flush the contents of all open files.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBTree.prototype.flush = function (cb) {
  async.forEachOf(this.files,
    function (file, fid, callback) {
      file.flush(callback);
    },
    cb);
};

/**
 * Disconnect this tree.
 */
SMBTree.prototype.disconnect = function () {
  this.spiTree.disconnect(function (err) {
    if (err) {
      logger.error('tree disconnect failed:', err);
    }
  });
};

module.exports = SMBTree;

