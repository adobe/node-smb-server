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
var Path = require('path');

var logger = require('winston').loggers.get('spi');

var Tree = require('../../spi/tree');
var utils = require('../../utils');
var consts = require('./common');
var RQWorkFile = require('./workfile');

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

function _getFilePath(path) {
  var parent = utils.getParentPath(path);
  var name = utils.getPathName(path);
  return Path.join(parent, consts.WORK_DIR, name);
}

function _getFileInfoPath(path) {
  return _getFilePath(path) + '.json';
}

function _createWorkFile(name, cb) {
  var self = this;
  if (!self.rqTree.isTempFileName(name)) {
    var filePath = _getFileInfoPath(name);
    self.localTree.exists(filePath, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        logger.debug('%s attempting to create work file but it already exists', filePath);
        cb(null, true);
      } else {
        logger.debug('%s work file created', filePath);
        self.localTree.createFile(filePath, function (err) {
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
    var createdName = self.getCreateFileName(name);
    self.localTree.exists(createdName, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        logger.warn('%s attempt to create created file but it already exists', createdName);
        cb();
      } else {
        self.rqTree.isQueuedForDelete(name, function (err, queued) {
          if (err) {
            cb(err);
          } else if (queued) {
            logger.debug('%s is queued for delete, not creating a created file', name);
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
  return _getFilePath(path) + '.' + this.sessionId + '.downloading';
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
  this.localTree.exists(downloadingFile, cb);
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
  var fileName = _getFileInfoPath(name);
  this.localTree.exists(fileName, cb);
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
  var fileName = _getFileInfoPath(name);
  function createWorkFile() {
    self.localTree.open(fileName, function (err, workFile) {
      if (err) {
        cb(err);
      } else {
        RQWorkFile.createInstance(fileName, workFile, self, cb);
      }
    });
  }
  self.localTree.exists(fileName, function (err, exists) {
    if (err) {
      cb(err);
    } else if (!exists) {
      self.localTree.open(name, function (err, localFile) {
        if (err) {
          logger.warn('unexpected error when attempting to open local file in work tree', err);
          cb(err);
        } else if (localFile.isFile()) {
          logger.warn('%s has no work file. creating and sending conflict event', name);
          self.createFileExisting(name, function (err) {
            if (err) {
              cb(err);
            } else {
              self.rqTree.emitSyncConflict(name);
              createWorkFile();
            }
          });
        } else {
          cb(null, localFile);
        }
      });
    } else {
      createWorkFile();
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
  var workPattern = _getFilePath(pattern);
  this.localTree.list(workPattern, function (err, files) {
    var result = [];
    for (var i = 0; i < files.length; i++) {
      if (utils.getFileExtension(files[i].getName()) == 'json') {
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
  var fileInfoName = _getFileInfoPath(name);
  var deleteWork = function () {
    self.localTree.exists(fileInfoName, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        logger.debug('[rq-work] delete removing file %s', fileInfoName);
        self.localTree.delete(fileInfoName, cb);
      } else {
        // nothing to delete
        logger.warn('%s attempting to delete work file but none exists', fileInfoName);
        cb();
      }
    });
  };
  if (self.rqTree.isTempFileName(name)) {
    logger.debug('[rq-work] delete ignoring temp file %s', name);
    // ignore temp files
    cb();
  } else {
    var createdName = self.getCreateFileName(name);
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
 * Returns an error. Deleting is not supported in work tree.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.deleteDirectory = function (name, cb) {
  var self = this;
  var toDelete = Path.join(name, consts.WORK_DIR);
  self.localTree.exists(toDelete, function (err, exists) {
    if (err) {
      cb(err);
    } else if (exists) {
      logger.debug('[rq-work] deleteDirectory removing work directory %s', toDelete);
      self.localTree.deleteDirectory(toDelete, cb);
    } else {
      logger.debug('[rq-work] deleteDirectory ignoring work directory because it does not exist %s', toDelete);
      cb();
    }
  });
};

/**
 * Returns an error. Refreshing is not supported in work tree.
 *
 * @param {String} folderPath
 * @param {Boolean} deep
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.refresh = function (folderPath, deep, cb) {
  cb('%s: refreshing not supported in work tree', folderPath);
};

/**
 * Returns an error. Disconnecting is not supported in work tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.disconnect = function (cb) {
  cb('disconnect not supported in work tree');
};

/**
 * Retrieves a value indicating whether a locally cached file was created locally.
 * @param {String} name normalized file path.
 * @param {Function} cb Will be invoked with result.
 * @param {String|Error} cb.err Will be truthy if there were problems retrieving the value.
 * @param {bool} cb.created Will be true if the file was created locally, otherwise false.
 */
RQWorkTree.prototype.isCreatedLocally = function (name, cb) {
  var self = this;
  self.localTree.exists(self.getCreateFileName(name), function (err, exists) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      cb(null, exists);
    }
  });
};

/**
 * Retrieves the name of the file used to indicate that a file was created locally.
 * @returns {String} The name of the create file.
 */
RQWorkTree.prototype.getCreateFileName = function (name) {
  return _getFilePath(name) + '.rqcf';
};

module.exports = RQWorkTree;
