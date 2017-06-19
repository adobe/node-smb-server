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
var async = require('async');

var logger = require('winston').loggers.get('spi');

var Tree = require('../../spi/tree');
var utils = require('../../utils');
var consts = require('./common');
var RQLocalFile = require('./localfile');

var RQLocalTree = function (share, localTree, rqTree) {
  if (!(this instanceof RQLocalTree)) {
    return new RQLocalTree(share, localTree, rqTree);
  }

  this.source = localTree;
  this.rqTree = rqTree;
  this.share = share;
  this.sessionId = new Date().getTime();
  this.waits = {};

  Tree.call(this, {});
};

util.inherits(RQLocalTree, Tree);

/**
 * Retrieves the path to a given file's working information.
 * @param {string} path The path whose work path should be retrieved.
 * @return {string} Path to a file's work file.
 * @private
 */
function _getWorkingFilePath(path) {
  var parent = utils.getParentPath(path);
  var name = utils.getPathName(path);
  return Path.join(parent, consts.WORK_DIR, name);
}

/**
 * Retrieves the path to a given file's download indicator file.
 * @param {string} path The path whose indicator should be retrieved.
 * @returns {string} Path to a downloading indicator.
 * @private
 */
function _getDownloadingPath(path) {
  // append the session id to downloading file name so that unexpected crashes won't "lock" the file
  return _getWorkingFilePath(path) + '.' + this.sessionId + '.downloading';
}

/**
 * Indicates that the download of a given file has completed and sends events to any "threads" that are blocked
 * by the waiting download.
 * @param {string} path The file whose download completed.
 * @private
 */
function _notifyDownloadComplete(path) {
  var self = this;
  if (self.waits[path]) {
    var i;
    for (i = 0; i < self.waits[path].length; i++) {
      // invoke waiting callback
      logger.debug('%s download complete, notifying waiting threads', path);
      self.waits[path][i]();
    }
    self.waits[path] = [];
  }
}

/**
 * Writes information to a work data file.
 * @param {File} workFile The work file to which to write.
 * @param {object} cacheInfo Will be converted to a JSON string and written to the file.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @private
 */
function _writeWorkData(workFile, cacheInfo, cb) {
  var filePath = workFile.getPath();
  logger.debug('_writeWorkData: entering with filePath=%s', filePath);
  var writeData = new Buffer(JSON.stringify(cacheInfo));

  workFile.setLength(writeData.length, function (lengthErr) {
    if (lengthErr) {
      logger.error('unable to set length of work file %s', filePath, lengthErr);
      cb(lengthErr);
    } else {
      workFile.write(writeData, 0, function (writeErr) {
        workFile.close(function (closeErr) {
          if (writeErr) {
            logger.error('unable to write to work file %s', filePath, writeErr);
            cb(writeErr);
          } else {
            if (closeErr) {
              logger.warn('unexpected error while closing work file %s', filePath, closeErr);
            }
            logger.debug('finished writing data to %s', filePath);
            cb();
          }
        });
      });
    }
  });
}

/**
 * Creates a work file for a corresponding file, if needed.
 * @param {string} name The file for which a work file will be created.
 * @param {boolean} created The to write to the work file indicating whether or not the file was created locally.
 * @param {int} remoteModified The remote modified date that will be written to the work file.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @private
 */
function _createWorkFile(targetFile, created, isRefreshed, remoteFile, cb) {
  var name = targetFile.getPath();
  var self = this;

  function _openFile(toOpen) {
    self.source.open(toOpen, cb);
  }

  function _createFile(path) {
    self.source.createFile(path, function (err, workFile) {
      if (err) {
        cb(err);
      } else {
        logger.debug('%s work file created', path);
        _writeWorkData.call(self, workFile, RQLocalFile.getCacheInfo(targetFile, remoteFile, created, isRefreshed), function (err) {
          if (err) {
            cb(err);
          } else {
            _openFile(path);
          }
        });
      }
    });
  }

  if (!self.isTempFileName(name) && !targetFile.isDirectory()) {
    var filePath = self.getInfoFilePath(name);

    self.source.exists(filePath, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        logger.debug('%s work file already exists', filePath);
        if (created) {
          logger.warn('%s work file already exists and file is being created. re-creating work file', filePath);
          self.source.delete(filePath, function (err) {
            if (err) {
              cb(err);
            } else {
              _createFile(filePath);
            }
          });
        } else {
          _openFile(filePath);
        }
      } else {
        _createFile(filePath);
      }
    });
  } else {
    // temp files and directories don't need work files
    logger.debug('%s does not need a work file', targetFile.getPath());
    cb();
  }
}

/**
 * Retrieves a value indicating whether or not a path fits patterns identifying temporary files or directories.
 * @param {string} name The path to test.
 * @return {string} TRUE if the path is a temp path, FALSE if not.
 */
RQLocalTree.prototype.isTempFileName = function (name) {
  return this.rqTree.isTempFileName(name);
};

/**
 * Determines if cache information exists at the given path.
 * @param {string} path The path to determine existence.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @param {boolean} cb.exists Will be TRUE if cache information exists, otherwise FALSE.
 *
 */
RQLocalTree.prototype.cacheInfoExists = function (path, cb) {
  if (!this.isTempFileName(path)) {
    // small optimization for temp files. only check for info file if it's not a temp file
    this.source.exists(this.getInfoFilePath(path), cb);
  } else {
    cb(null, false);
  }
};

/**
 * Determines if a given path is a directory.
 * @param {string} name The path to test.
 * @param {function} cb Invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @param {boolean} cb.isDir TRUE if the path is a directory, otherwise FALSE.
 */
RQLocalTree.prototype.isLocalDirectory = function (name, cb) {
  var self = this;
  self.exists(name, function (err, exists) {
    if (err) {
      cb(err);
    } else if (exists) {
      self.rqTree.isLocalDirectoryOpen(name, cb);
    } else {
      // if the path doesn't exist then it's a work file, so it's not a directory
      cb(null, false);
    }
  });
};

/**
 * Given a file path, retrieves the path to its cache info file.
 * @param {string} path The path whose cache info file path should be retrieved.
 * @return {string} The path to a cache info file.
 */
RQLocalTree.prototype.getInfoFilePath = function (path) {
  return _getWorkingFilePath(path) + '.json';
};

/**
 * Determines if a given path was created locally in the cache.
 * @param {string} path The path to check.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @param {boolean} cb.createdLocally Will be TRUE if the file was created locally, otherwise FALSE.
 */
RQLocalTree.prototype.isCreatedLocally = function (path, cb) {
  var self = this;
  self.source.exists(path, function (err, exists) {
    if (err) {
      cb(err);
    } else if (!exists) {
      cb(null, false);
    } else {
      self.open(path, function (err, localFile) {
        if (err) {
          cb(err);
        } else {
          cb(null, localFile.isCreatedLocally());
        }
      });
    }
  });
};

/**
 * If a given path is currently downloading, this method will "block" until the download is finished and then will
 * invoke its callback.
 * @param {string} path The path to the file.
 * @param {function} cb Will be invoked when the download is finished, if applicable. If the file is not downloading
 *  then the callback will be invoked immediately.
 * @param {string|Error} cb.err Will be truthy if there were errors while waiting.
 */
RQLocalTree.prototype.waitOnDownload = function (path, cb) {
  var self = this;
  self.isDownloading(path, function (err, isDownloading) {
    if (err) {
      cb(err);
    } else if (isDownloading) {
      logger.debug('%s is downloading, waiting for completion', path);
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
RQLocalTree.prototype.isDownloading = function (path, cb) {
  if (!this.isTempFileName(path)) {
    var downloadingFile = _getDownloadingPath.call(this, path);
    logger.debug('checking for downloading file %s', downloadingFile);
    this.source.exists(downloadingFile, cb);
  } else {
    // temp files are never downloading
    cb(null, false);
  }
};

/**
 * Sets a given file's status to downloading.
 * @param {string} path Path to the file.
 * @param {boolean} isDownloading TRUE if the file is downloading, FALSE if it is not.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {string|Error} cb.err Will be truthy if there were errors setting the value.
 */
RQLocalTree.prototype.setDownloading = function (path, isDownloading, cb) {
  var self = this;
  var downloadingFile = _getDownloadingPath.call(this, path);
  self.isDownloading(path, function (err, downloading) {
    if (downloading == isDownloading) {
      // nothing to be done
      cb();
    } else if (isDownloading) {
      logger.debug('creating downloading file %s', downloadingFile);
      self.source.createFile(downloadingFile, function (err) {
        cb(err);
      });
    } else {
      logger.debug('removing downloading file %s', downloadingFile);
      self.source.delete(downloadingFile, function (err) {
        cb(err);
        _notifyDownloadComplete.call(self, path);
      });
    }
  });
};

/**
 * Downloads a file from a different tree and stores it in the local tree.
 * @param {Tree} remote The tree from which the file will be retrieved.
 * @param {string} name The path of the file to download.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the download.
 * @param {File} cb.File The locally downloaded file.
 */
RQLocalTree.prototype.download = function (remote, name, cb) {
  var self = this;

  function _resetDownloading(callback) {
    self.setDownloading(name, false, function (dlErr) {
      if (dlErr) {
        logger.error('unexpected error while attempting to reset file download flag for %s', name, dlErr);
      }
      callback();
    });
  }

  self.setDownloading(name, true, function (err) {
    if (err) {
      cb(err);
    } else {
      remote.open(self.rqTree.remoteEncodePath(name), function (err, remoteFile) {
        if (err) {
          cb(err);
        } else {
          self.share.fetchResource(self.rqTree.remoteEncodePath(name), function (err, localPath) {
            if (err) {
              _resetDownloading(function () {
                cb(err);
              });
            } else {
              logger.debug('%d successfully completed initial cache of %s to %s', new Date().getTime(), name, localPath);
              self.source.open(name, function (err, file) {
                if (err) {
                  cb(err);
                } else {
                  self.createFromSource(file, remoteFile, false, function (err, localFile) {
                    if (err) {
                      cb(err);
                    } else {
                      _resetDownloading(function () {
                        logger.debug('recorded initial sync time of file %s', name);
                        cb(null, localFile);
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
};

/**
 * Refreshes the cache information about a file by removing its work data file and recreating it.
 * @param {string} name The path whose cache info should be refreshed.
 * @param {File} remoteFile The remote file whose information will be used in the cache info.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 */
RQLocalTree.prototype.refreshCacheInfo = function(name, remoteFile, cb) {
  var self = this;
  var filePath = self.getInfoFilePath(name);

  function _deleteWork(delCb) {
    self.cacheInfoExists(name, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        self.source.delete(filePath, function (err) {
          if (err) {
            cb(err);
          } else {
            delCb();
          }
        });
      } else {
        delCb();
      }
    });
  }

  _deleteWork(function () {
    self.source.open(name, function (err, localFile) {
      if (err) {
        cb(err);
      } else {
        _createWorkFile.call(self, localFile, false, true, remoteFile, function (err, workFile) {
          localFile.close(function (closeErr) {
            if (closeErr) {
              logger.error('unable to close local file %s', name, closeErr);
            }
            if (err) {
              cb(err);
            } else {
              workFile.close(function (err) {
                if (err) {
                  logger.error('unable to close work file %s', filePath, err);
                }
                cb();
              });
            }
          });
        });
      }
    });
  });
};

/**
 * Creates a new File instance for the tree based on a source File instance that has already been created.
 * @param {File} source The file from which the new instance will be created.
 * @param {File} remote File whose information will be used as remote data in the cache info.
 * @param {boolean} isCreated Will be used as the local created flag of the new file instance.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @param {File} cb.file The newly created file instance.
 */
RQLocalTree.prototype.createFromSource = function (source, remote, isCreated, cb) {
  var self = this;
  _createWorkFile.call(self, source, isCreated, false, remote, function (err, workFile) {
    if (err) {
      cb(err);
    } else {
      RQLocalFile.createInstance(source, workFile, self, cb);
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
RQLocalTree.prototype.exists = function (name, cb) {
  this.source.exists(name, cb);
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
RQLocalTree.prototype.open = function (name, cb) {
  var self = this;
  self.source.open(name, function (err, file) {
    if (err) {
      cb(err);
    } else {
      self.createFromSource(file, null, false, cb);
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
RQLocalTree.prototype.list = function (pattern, cb) {
  var self = this;
  self.source.list(pattern, function (err, files) {
    if (err) {
      cb(err);
    } else {
      var result = [];
      async.each(files, function (file, eachCb) {
        if (file.getName() != consts.WORK_DIR) {
          self.createFromSource(file, null, false, function (err, localFile) {
            if (err) {
              eachCb(err);
            } else {
              result.push(localFile);
              eachCb();
            }
          });
        } else {
          // don't include work dir
          eachCb();
        }
      }, function (err) {
        if (err) {
          cb(err);
        } else {
          cb(null, result);
        }
      });
    }
  });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
RQLocalTree.prototype.createFile = function (name, cb) {
  var self = this;
  this.source.createFile(name, function (err, file) {
    if (err) {
      cb(err);
    } else {
      self.createFromSource(file, null, true, cb);
    }
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
RQLocalTree.prototype.createDirectory = function (name, cb) {
  this.source.createDirectory(name, cb);
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalTree.prototype.delete = function (name, cb) {
  var self = this;
  self.source.delete(name, function (err) {
    if (err) {
      cb(err);
    } else {
      self.cacheInfoExists(name, function (err, exists) {
        if (err) {
          cb(err);
        } else if (exists) {
          self.source.delete(self.getInfoFilePath(name), cb);
        } else {
          cb();
        }
      });
    }
  });
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalTree.prototype.deleteDirectory = function (name, cb) {
  var self = this;

  function _deleteWorkDir(delCb) {
    var workDir = Path.join(name, consts.WORK_DIR);
    self.source.exists(workDir, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        logger.debug('%s processing work directory for removal', workDir);
        // delete any dangling work files
        self.source.list(Path.join(workDir, '*'), function (err, workFiles) {
          if (err) {
            cb(err);
          } else {
            async.eachSeries(workFiles, function (workFile, eachCb) {
              logger.debug('%s removing dangling workfile', workFile.getPath());
              self.source.delete(workFile.getPath(), eachCb);
            }, function (err) {
              if (err) {
                cb(err);
              } else {
                logger.debug('%s deleting work directory', workDir);
                self.source.deleteDirectory(workDir, function (err) {
                  if (err) {
                    cb(err);
                  } else {
                    delCb();
                  }
                });
              }
            });
          }
        });
      } else {
        logger.debug('%s has no work directory', name);
        delCb();
      }
    });
  }

  self.list(Path.join(name, '*'), function (err, items) {
    if (err) {
      cb(err);
    } else if (items.length) {
      // if the directory is not empty then delegate to the underlying source whether or not it can be deleted. if
      // non-empty deletion is supported then the work dir will be cleared out automatically
      logger.debug('%s is not empty, delegating delete to underlying source', name);
      self.source.deleteDirectory(name, cb);
    } else {
      // directory is empty, so clear out and remove the work dir to safely support backends that require directories
      // to be empty before deleting
      _deleteWorkDir(function() {
        logger.debug('%s deleting directory after clearing work dir', name);
        self.source.deleteDirectory(name, cb);
      });
    }
  });
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {File} newRemote If truthy, the existing remote File instance of the new path.
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalTree.prototype.renameExt = function (oldName, newName, newRemote, cb) {
  var self = this;
  var newCreated = newRemote ? false : true;

  function _deleteCacheInfo(deleteName, doDelete, delCb) {
    self.cacheInfoExists(deleteName, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists/* && doDelete*/) {
        // newName work file should only be removed if it's not being overwritten
        logger.debug('%s rename involved cache info file already exists, removing', deleteName);
        self.source.delete(self.getInfoFilePath(deleteName), function (err) {
          if (err) {
            cb(err);
          } else {
            delCb(exists);
          }
        });
      } else {
        delCb(exists);
      }
    });
  }

  self.source.rename(oldName, newName, function (err) {
    if (err) {
      cb(err);
    } else {
      _deleteCacheInfo(oldName, true, function () {
        _deleteCacheInfo(newName, !newCreated, function (newExisted) {
          logger.debug('%s work file does not exist, creating', newName);
          self.source.open(newName, function (err, renamed) {
            if (err) {
              cb(err);
            } else {
              // if the target work file already existed, don't flag the file as newly created.
              _createWorkFile.call(self, renamed, newCreated, !newCreated, newRemote, function (createErr) {
                renamed.close(function (closeErr) {
                  if (closeErr) {
                    logger.error('unable to close new file after rename %s', newName, closeErr);
                  }
                  if (createErr) {
                    logger.error('unable to create new work file after rename %s', newName, createErr);
                    cb(createErr);
                  } else {
                    cb();
                  }
                });
              });
            }
          });
        });
      });
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
RQLocalTree.prototype.rename = function (oldName, newName, cb) {
  this.renameExt(oldName, newName, false, cb);
};

/**
 * Refresh a specific folder.
 *
 * @param {String} folderPath
 * @param {Boolean} deep
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalTree.prototype.refresh = function (folderPath, deep, cb) {
  this.source.refresh(folderPath, deep, cb);
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalTree.prototype.disconnect = function (cb) {
  this.source.disconnect(cb);
};

module.exports = RQLocalTree;
