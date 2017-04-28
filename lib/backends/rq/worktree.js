/*
 *  Copyright 2015 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

'use strict';

var util = require('util');

var logger = require('winston').loggers.get('spi');

var Tree = require('../../spi/tree');
var utils = require('../../utils');

var RQWorkTree = function (share, rqTree, localTree) {
  if (!(this instanceof RQWorkTree)) {
    return new RQWorkTree(share, rqTree, localTree);
  }
  this.rqTree = rqTree;
  this.localTree = localTree;
  this.sessionId = new Date().getTime();
  this.waits = {};

  Tree.call(this, share);
};

util.inherits(RQWorkTree, Tree);

function _createWorkFile(name, cb) {
  var self = this;
  if (!self.rqTree.isTempFileName(name)) {
    self.localTree.exists(name, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        logger.debug('%s attempting to create work file but it already exists', name);
        cb(null, true);
      } else {
        logger.debug('%s work file created', name);
        self.localTree.createFile(name, function (err) {
          cb(err);
        });
      }
    });
  } else {
    // temp files don't need work files
    cb();
  }
}

function _createCreatedFile(name, cb) {
  var self = this;
  if (!self.rqTree.isTempFileName(name)) {
    var createdName = self.rqTree.getCreateFileName(name);
    self.localTree.exists(createdName, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        logger.warn('%s attempt to create created file but it already exists', name);
        cb();
      } else {
        self.rqTree.isQueuedForDelete(name, function (err, queued) {
          if (err) {
            cb(err);
          } else if (queued) {
            logger.debug('%s is queued for delete, not creating a created file');
            cb();
          } else {
            self.localTree.createFile(createdName, function (err) {
              cb(err);
            });
          }
        });
      }
    });
  } else {
    // temp files don't need created files
    cb();
  }
}

function _getDownloadingPath(path) {
  // append the session id to downloading file name so that unexpected crashes won't "lock" the file
  return path + '.' + this.sessionId + '.downloading';
}

function _notifyDownloadComplete(path) {
  var self = this;
  if (self.waits[path]) {
    var i;
    for (i = 0; i < self.waits[path].length; i++) {
      // invoke waiting callback
      self.waits[path][i]();
    }
    self.waits[path] = [];
  }
}

/**
 * If a given path is currently downloading, this method will "block" until the download is finished and then will
 * invoke its callback.
 * @param {string} path The path to the file.
 * @param {function} cb Will be invoked when the download is finished, if applicable. If the file is not downloading
 *  then the callback will be invoked immediately.
 * @param {string|Error} cb.err Will be truthy if there were errors while waiting.
 */
RQWorkTree.prototype.waitOnDownload = function (path, cb) {
  var self = this;
  self.isDownloading(path, function (err, isDownloading) {
    if (err) {
      cb(err);
    } else if (isDownloading) {
      // wait for download
      if (!self.waits[path]) {
        self.waits[path] = [];
      }
      self.waits[path].push(cb);
    } else {
      // not downloading, return immediately
      cb();
    }
  });
};

/**
 * Retrieves a value indicating whether or not a file is downloading.
 * @param {string} path The path to the file.
 * @param {function} cb Will be invoked with the result.
 * @param {string|Error} cb.err Will be truthy if there were errors retrieving the value.
 * @param {boolean} cb.isDownloading TRUE if the file is downloading, false if it is not.
 */
RQWorkTree.prototype.isDownloading = function (path, cb) {
  var downloadingFile = _getDownloadingPath.call(this, path);
  logger.debug('checking for downloading file %s', downloadingFile);
  this.exists(downloadingFile, cb);
};

/**
 * Sets a given file's status to downloading.
 * @param {string} path Path to the file.
 * @param {boolean} isDownloading TRUE if the file is downloading, FALSE if it is not.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {string|Error} cb.err Will be truthy if there were errors setting the value.
 */
RQWorkTree.prototype.setDownloading = function (path, isDownloading, cb) {
  var self = this;
  var downloadingFile = _getDownloadingPath.call(this, path);
  self.isDownloading(path, function (err, downloading) {
    if (downloading == isDownloading) {
      // nothing to be done
      cb();
    } else if (isDownloading) {
      logger.debug('creating downloading file %s', downloadingFile);
      self.localTree.createFile(downloadingFile, function (err) {
        cb(err);
      });
    } else {
      logger.debug('removing downloading file %s', downloadingFile);
      self.localTree.delete(downloadingFile, function (err) {
        cb(err);
        _notifyDownloadComplete.call(self, path);
      });
    }
  });
};

/**
 * Create a new file.
 *
 * @param {String} path file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
RQWorkTree.prototype.createFile = function (path, cb) {
  var self = this;
  _createWorkFile.call(self, path, function (err) {
    if (err) {
      cb(err);
    } else {
      _createCreatedFile.call(self, path, cb);
    }
  });
};

/**
 * Creates work files for a file that is pre-existing.
 * @param {string} path file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
RQWorkTree.prototype.createFileExisting = function (path, cb) {
  _createWorkFile.call(this, path, cb);
};

/**
 * Renames a local work directory if it exists.
 * @param oldName {string} The path of the directory to rename.
 * @param newName {string} The path of the new directory name.
 * @param cb {function} Will be invoked when the operation is complete.
 * @param cb.err {string|Error} Will be truthy if there were issues renaming the directory.
 */
RQWorkTree.prototype.renameDirectory = function (oldName, newName, cb) {
  var self = this;
  self.localTree.exists(oldName, function (err, exists) {
    if (err) {
      cb(err);
    } else if (exists) {
      self.localTree.rename(oldName, newName, cb);
    } else {
      logger.debug('%s rename %s work directory does not exist, not renaming', oldName, newName);
      cb();
    }
  });
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.rename = function (oldName, newName, cb) {
  var self = this;
  self.delete(oldName, function (err) {
    if (err) {
      cb(err);
    } else {
      _createWorkFile.call(self, newName, function (err, existing) {
        if (err) {
          cb(err);
        } else if (existing) {
          logger.debug('%s rename %s work file already existed, not creating created file', oldName, newName);
          cb();
        } else {
          _createCreatedFile.call(self, newName, cb);
        }
      });
    }
  });
};

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
RQWorkTree.prototype.exists = function (name, cb) {
  this.localTree.exists(name, cb);
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
RQWorkTree.prototype.open = function (name, cb) {
  var self = this;
  self.exists(name, function (err, exists) {
    if (err) {
      cb(err);
    } else if (!exists) {
      logger.warn('%s has no work file. creating and sending conflict event', name);
      self.createFileExisting(name, function (err) {
        if (err) {
          cb(err);
        } else {
          self.rqTree.emitSyncConflict(name);
          self.localTree.open(name, cb);
        }
      });
    } else {
      self.localTree.open(name, cb);
    }
  });
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
RQWorkTree.prototype.list = function (pattern, cb) {
  this.localTree.list(pattern, function (err, files) {
    var result = [];
    for (var i = 0; i < files.length; i++) {
      if (utils.getFileExtension(files[i].getName()) != 'rqcf') {
        result.push(files[i]);
      }
    }
    cb(null, result);
  });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created directory
 */
RQWorkTree.prototype.createDirectory = function (name, cb) {
  this.localTree.createDirectory(name, cb);
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.delete = function (name, cb) {
  logger.debug('[rq-work] delete %s', name);
  var self = this;
  var deleteWork = function () {
    self.localTree.exists(name, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        logger.debug('[rq-work] delete removing file %s', name);
        self.localTree.delete(name, cb);
      } else {
        // nothing to delete
        logger.warn('%s attempting to delete work file but none exists', name);
        cb();
      }
    });
  };
  if (self.rqTree.isTempFileName(name)) {
    logger.debug('[rq-work] delete ignoring temp file %s', name);
    // ignore temp files
    cb();
  } else {
    var createdName = self.rqTree.getCreateFileName(name);
    self.localTree.exists(createdName, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        logger.debug('[rq-work] delete removing create file %s', createdName);
        self.localTree.delete(createdName, function (err) {
          if (err) {
            cb(err);
          } else {
            deleteWork();
          }
        });
      } else {
        deleteWork();
      }
    });
  }
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.deleteDirectory = function (name, cb) {
  this.localTree.deleteDirectory(name, cb);
};

/**
 * Refresh a specific folder.
 *
 * @param {String} folderPath
 * @param {Boolean} deep
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.refresh = function (folderPath, deep, cb) {
  this.localTree.refresh(folderPath, deep, cb);
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.disconnect = function (cb) {
  this.localTree.disconnect(cb);
};

module.exports = RQWorkTree;
