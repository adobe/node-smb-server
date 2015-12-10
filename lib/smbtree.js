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

var logger = require('winston').loggers.get('default');
var async = require('async');
var _ = require('lodash');

var SMBFile = require('./smbfile');
var SMBError = require('./smberror');
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
  this.listeners = {};
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
        callback(new SMBError(consts.STATUS_NO_SUCH_FILE, 'not found'));
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

  if (createDisposition === consts.FILE_OPEN || createDisposition === consts.FILE_OVERWRITE) {
    // open existing
    open(false, cb);
  } else if (createDisposition === consts.FILE_CREATE) {
    // create new and open
    var createFn = openTargetDirectory ? self.createDirectory : self.createFile;
    createFn.call(self, name, function (err) {
      if (err) {
        cb(err);
      } else {
        open(true, cb);
      }
    });
  } else {
    // conditional create and open (consts.FILE_SUPERSEDE, consts.FILE_OPEN_IF, consts.FILE_OVERWRITE_IF)
    async.waterfall([
      exists,
      createIf,
      open
    ], cb);
  }
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
 * Reopen an existing file/directory using an already assigned fid.
 * Special purpose method called when an already open SMBFile instance
 * is renamed in order to make sure that the internal state of the
 * wrapped File instance is consistent with the new path/name.
 *
 * @param {String} name file name
 * @param {Number} fid file ID
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {SMBFile} cb.file reopened file
 */
SMBTree.prototype.reopen = function (name, fid, cb) {
  var self = this;
  this.spiTree.open(utils.normalizeSMBFileName(name), function (err, file) {
    if (err) {
      cb(err);
    } else {
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
  var npattern = utils.normalizeSMBFileName(pattern);
  var self = this;
  this.spiTree.list(npattern, function (err, files) {
    if (err) {
      cb(err);
    } else {
      var results = files.map(function (file) {
        return new SMBFile(file);
      });
      cb(null, results);
      if (npattern.substr(-1) === '*') {
        // emit event
        self.smbServer.emit('folderListed', self.smbShare.getName(), utils.getParentPath(npattern));
      }
    }
  });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {SMBFile} cb.file created file
 */
SMBTree.prototype.createFile = function (name, cb) {
  var self = this;
  var nname = utils.normalizeSMBFileName(name);

  this.spiTree.createFile(nname, function (err) {
    cb(err);
    if (!err) {
      var callback = self.removeListener(nname);
      if (callback) {
        callback('added', utils.getPathName(nname));
      }
      // emit event
      self.smbServer.emit('fileCreated', self.smbShare.getName(), nname);
    }
  });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {SMBFile} cb.file created directory
 */
SMBTree.prototype.createDirectory = function (name, cb) {
  var self = this;
  var nname = utils.normalizeSMBFileName(name);

  this.spiTree.createDirectory(nname, function (err) {
    cb(err);
    if (!err) {
      var callback = self.removeListener(nname);
      if (callback) {
        callback('added', utils.getPathName(nname));
      }
      // emit event
      self.smbServer.emit('folderCreated', self.smbShare.getName(), nname);
    }
  });
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.deleted true if the file could be deleted; false otherwise
 */
SMBTree.prototype.delete = function (name, cb) {
  var self = this;
  var nname = utils.normalizeSMBFileName(name);

  this.spiTree.delete(nname, function (err) {
    cb(err);
    if (!err) {
      var callback = self.removeListener(nname);
      if (callback) {
        callback('removed', utils.getPathName(nname));
      }
      // emit event
      self.smbServer.emit('fileDeleted', self.smbShare.getName(), nname);
    }
  });
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.deleted true if the directory could be deleted; false otherwise
 */
SMBTree.prototype.deleteDirectory = function (name, cb) {
  var self = this;
  var nname = utils.normalizeSMBFileName(name);

  this.spiTree.deleteDirectory(nname, function (err) {
    cb(err);
    if (!err) {
      var callback = self.removeListener(nname);
      if (callback) {
        callback('removed', utils.getPathName(nname));
      }
      // emit event
      self.smbServer.emit('folderDeleted', self.smbShare.getName(), nname);
    }
  });
};

/**
 * Rename a file or directory.
 *
 * @param {String|SMBFile} nameOrFile name of target file or target file
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
SMBTree.prototype.rename = function (nameOrFile, newName, cb) {
  var self = this;

  var targetFID;
  var oldName;
  if (typeof nameOrFile === 'string') {
    oldName = nameOrFile;
  } else {
    targetFID = nameOrFile.getId();
    oldName = nameOrFile.getPath();
  }
  var nOldName = utils.normalizeSMBFileName(oldName);
  var nNewName = utils.normalizeSMBFileName(newName);

  // todo check if source has uncommitted changes (i.e. needs flush)
  // todo check if source has deleteOnClose set
  this.spiTree.rename(nOldName, nNewName, function (err) {
    if (err) {
      cb(err);
      return;
    }
    if (targetFID) {
      self.reopen(nNewName, targetFID, cb);
    } else {
      cb();
    }
    var callback = self.removeListener(nOldName);
    if (callback) {
      callback('renamed', utils.getPathName(nOldName), utils.getPathName(nNewName));
    }
    // emit event
    self.smbServer.emit('itemMoved', self.smbShare.getName(), nOldName, nOldName);
  });
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

/**
 * Add a one-shot notification listener that will send a NOTIFY_CHANGE response.
 *
 * @param {String} mid - mutex id
 * @param {Object} file - SMBFile to check for changes
 * @param {Function} cb - callback to invoke on changes
 */
SMBTree.prototype.addListener = function (mid, file, cb) {
  this.listeners[mid] = { file: file, cb: cb };
};

/**
 * Return the appropriate listener for some change. If found, it automatically
 * removes it from the array of listeners.
 *
 * @param {String} name file name that changed
 * @return {Function} listener callback or null
 */
SMBTree.prototype.removeListener = function (name) {
  var parentPath = utils.getParentPath(name);
  for (var mid in this.listeners) {
    if (this.listeners.hasOwnProperty(mid)) {
      var listener = this.listeners[mid];
      if (parentPath === listener.file.getPath()) {
        delete this.listeners[mid];
        return listener.cb;
      }
    }
  }
};

module.exports = SMBTree;
