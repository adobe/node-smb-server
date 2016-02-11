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

var logger = require('winston').loggers.get('default');
var async = require('async');
var _ = require('lodash');

var SMBFile = require('./smbfile');
var common = require('./common');
var utils = require('./utils');

/**
 * Represents a tree connection established by <code>TREE_CONNECT_ANDX</code> or <code>SMB2 TREE_CONNECT</code>
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

  function create(callback) {
    var createFn = openTargetDirectory ? self.createDirectory : self.createFile;
    createFn.call(self, name, callback);
  }

  function open(callback) {
    self.spiTree.open(name, function (err, file) {
      if (err) {
        callback(err);
        return;
      }
      var fid = ++SMBTree.fidCounter;
      // todo what's the exact difference between consts.FILE_SUPERSEDE and consts.FILE_OVERWRITE_IF ?
      var openAction;
      if (createDisposition === common.FILE_OVERWRITE
        || createDisposition === common.FILE_OVERWRITE_IF
        || createDisposition === common.FILE_SUPERSEDE) {
        openAction = common.FILE_OVERWRITTEN;
      } else {
        openAction = common.FILE_OPENED;
      }
      var result = new SMBFile(file, self, openAction, fid);
      self.files[fid] = result;
      if (openAction === common.FILE_OVERWRITTEN) {
        result.setLength(0, function (err) {
          callback(err, result);
        });
      } else {
        callback(null, result);
      }
    });
  }

  if (createDisposition === common.FILE_OPEN || createDisposition === common.FILE_OVERWRITE) {
    // open existing
    open(cb);
  } else if (createDisposition === common.FILE_CREATE) {
    // create new
    create(cb);
  } else {
    // conditional create/open (consts.FILE_SUPERSEDE, consts.FILE_OPEN_IF, consts.FILE_OVERWRITE_IF)
    self.exists(name, function (err, exists) {
      if (err) {
        cb(err);
        return;
      }
      if (exists) {
        open(cb);
      } else {
        create(cb);
      }
    });
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
      var result = new SMBFile(file, self, common.FILE_OPENED, fid);
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
      var result = new SMBFile(file, self, common.FILE_OPENED, fid);
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
        return new SMBFile(file, self);
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

  this.spiTree.createFile(nname, function (err, file) {
    if (err) {
      cb(err);
      return;
    }
    var fid = ++SMBTree.fidCounter;
    var result = new SMBFile(file, self, common.FILE_CREATED, fid);
    self.files[fid] = result;
    cb(null, result);

    self.notifyChangeListeners(common.FILE_ACTION_ADDED, nname);

    // emit event
    self.smbServer.emit('fileCreated', self.smbShare.getName(), nname);
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

  this.spiTree.createDirectory(nname, function (err, file) {
    if (err) {
      cb(err);
      return;
    }
    var fid = ++SMBTree.fidCounter;
    var result = new SMBFile(file, self, common.FILE_CREATED, fid);
    self.files[fid] = result;
    cb(null, result);

    self.notifyChangeListeners(common.FILE_ACTION_ADDED, nname);

    // emit event
    self.smbServer.emit('folderCreated', self.smbShare.getName(), nname);
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
      self.notifyChangeListeners(common.FILE_ACTION_REMOVED, nname);

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
      self.notifyChangeListeners(common.FILE_ACTION_REMOVED, nname);

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

    self.notifyChangeListeners(common.FILE_ACTION_RENAMED, nOldName, nNewName);

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
 * Register a one-shot notification listener that will send a NT_TRANSACT_NOTIFY_CHANGE response.
 *
 * see https://msdn.microsoft.com/en-us/library/ee442155.aspx
 *
 * @param {Number} mid - multiplex id (msg.header.mid, identifies an SMB request within an SMB session)
 * @param {SMBFile} file - directory to watch for changes
 * @param {Boolean} deep - watch all subdirectories too
 * @param {Number} completionFilter - completion filter bit flags
 * @param {Function} cb - callback to be called on changes
 * @param {Number} cb.action - file action
 * @param {String} cb.name - name of file that changed
 * @param {String} [cb.newName] - optional, new name if this was a rename
 */
SMBTree.prototype.registerChangeListener = function (mid, file, deep, completionFilter, cb) {
  this.listeners[mid] = {
    mid: mid,
    path: file.getPath(),
    deep: deep,
    completionFilter: completionFilter,
    cb: cb
  };
};

/**
 * Notify the appropriate listener (if there is one) for some change
 * and remove it from the collection of registered listeners (one shot notification).
 *
 * @param {Number} action file action
 * @param {String} name name of file that changed
 * @param {String} [newName] optional, new name of file in case of a rename
 */
SMBTree.prototype.notifyChangeListeners = function (action, name, newName) {

  function trimListenerPath(name, listener) {
    return name.substr(listener.path.length + ((listener.path === '/') ? 0 : 1));
  }

  function getSearchPredicate(path) {
    return function (listener, mid) {
      // todo evaluate listener.completionFilter WRT action
      return (!listener.deep && utils.getParentPath(path) === listener.path)
        || (listener.deep && path.indexOf(listener.path) === 0);
    };
  }

  var listener = _.find(this.listeners, getSearchPredicate(name));
  var listenerNew;
  if (action === common.FILE_ACTION_RENAMED) {
    // rename
    listenerNew = _.find(this.listeners, getSearchPredicate(newName));
    if (listener || listenerNew) {
      if (listener === listenerNew) {
        // in-place rename: same listener for both old and new name
        listener.cb(action, name.substr(listener.path.length + 1), trimListenerPath(newName, listener));
      } else if (listener && listenerNew) {
        // there's separate listeners for old and new name
        listener.cb(common.FILE_ACTION_RENAMED_OLD_NAME, trimListenerPath(name, listener));
        listenerNew.cb(common.FILE_ACTION_RENAMED_NEW_NAME, trimListenerPath(newName, listenerNew));
      } else if (listener) {
        // there's only a listener for old name
        listener.cb(common.FILE_ACTION_RENAMED_OLD_NAME, trimListenerPath(name, listener));
      } else {
        // there's only a listener for new name
        listenerNew.cb(common.FILE_ACTION_RENAMED_NEW_NAME, trimListenerPath(newName, listenerNew));
      }
    }
  } else {
    // not a rename
    if (listener) {
      listener.cb(action, trimListenerPath(name, listener));
    }
  }

  // one shot notification, remove listeners
  if (listener) {
    delete this.listeners[listener.mid];
  }
  if (listenerNew) {
    delete this.listeners[listenerNew.mid];
  }
};

/**
 * Cancel the specified listener.
 *
 * @param {Number} mid - multiplex id (msg.header.mid, identifies an SMB request within an SMB session)
 * @return {Function} cancelled listener callback or null
 */
SMBTree.prototype.cancelChangeListener = function (mid) {
  var result = this.listeners[mid];
  if (result) {
    delete this.listeners[mid];
  }
  return result;
};

module.exports = SMBTree;
