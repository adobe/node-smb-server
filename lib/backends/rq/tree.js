/*
 *  Copyright 2016 Adobe Systems Incorporated. All rights reserved.
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

var Path = require('path');
var Util = require('util');

var logger = require('winston').loggers.get('spi');
var rqlog = require('winston').loggers.get('rq');
var request = require('request');
var unorm = require('unorm');

var File = require('../../spi/file');
var Tree = require('../../spi/tree');
var ntstatus = require('../../ntstatus');
var SMBError = require('../../smberror');
var utils = require('../../utils');
var FSShare = require('../fs/share');
var FSTree = require('../fs/tree');
var RQWorkTree = require('./worktree');
var RQFile = require('./file');
var RequestQueue = require('./requestqueue');
var RQProcessor = require('./rqprocessor');

/**
 * Creates an instance of RQTree.
 *
 * @constructor
 * @this {RQTree}
 * @param {RQShare} share parent share
 * @param {Tree} remote The tree to use for remote operations.
 * @param {Object} options Options for controlling the tree.
 */
var RQTree = function (share, remote, options) {
  if (!(this instanceof RQTree)) {
    return new RQTree(share, remote, options);
  }
  options = options || {};
  if (!options.localTree) {
    options.localTree = new FSTree(new FSShare('rqlocal', share.config.local));
  }
  if (!options.workTree) {
    options.workTree = new FSTree(new FSShare('rqwork', share.config.work));
  }
  this.options = options;
  this.remote = remote;
  this.local = options.localTree;
  this.work = new RQWorkTree(options.workTree.share, this, options.workTree);
  this.share = share;
  this.rq = new RequestQueue({
    path: share.config.work.path,
    db: options.rqdb
  });
  share.emit('requestqueueinit', this.rq);
  this.processor = new RQProcessor(this, share.config);

  this.processor.on('syncstart', function (data) {
    logger.info('start sync %s %s', data.method, data.file);
    share.emit('syncfilestart', data);
  });

  this.processor.on('syncend', function (data) {
    logger.info('end sync %s %s', data.method, data.file);
    share.emit('syncfileend', data);
  });

  this.processor.on('syncerr', function (data) {
    logger.error('err sync %s %s', data.method, data.file, data.err);
    share.emit('syncfileerr', data);
  });

  this.processor.on('error', function (err) {
    logger.error('there was a general error in the processor', err);
    share.emit('syncerr', {err: err});
  });

  this.processor.on('purged', function (purged) {
    logger.info('failed files were purged from the queue', purged);
    share.emit('syncpurged', {files: purged});
  });

  this.processor.on('syncabort', function (data) {
    logger.info('abort sync %s', data.file);
    share.emit('syncfileabort', data);
  });

  this.processor.on('syncprogress', function (data) {
    logger.debug('sync progress %s', data.path);
    share.emit('syncfileprogress', data);
  });

  if (!options.noprocessor) {
    this.processor.start(share.config);
  }

  Tree.call(this, share.config);
};

// the RQTree prototype inherits from Tree
Util.inherits(RQTree, Tree);

RQTree.prototype.handleErr = function (cb, err) {
  if (err) {
    rqlog.error('[rq] error', err);
  }
  cb(err);
};

RQTree.prototype.getLocalPath = function (name) {
  return Path.join(this.share.config.local.path, name);
};

RQTree.prototype.getRemotePath = function (name) {
  return this.share.buildResourceUrl(name);
};

RQTree.prototype.isTempFileName = function (name) {
  return this.remote.isTempFileNameForce(name);
};

/**
 * Encodes a path in a unicode format acceptable for sending to the remote host.
 * @param {String} path The path to be encoded.
 * @returns {String} The encoded path.
 */
RQTree.prototype.remoteEncodePath = function (path) {
  if (!this.config.noUnicodeNormalize) {
    return unorm.nfkc(path);
  } else {
    return path;
  }
};

/**
 * Determines whether or not a given item has been queued for deletion.
 * @param {string} name The name of the item to check.
 * @param {function} cb Will be invoked once the determination has been made.
 * @param {string|Error} cb.err Will be truthy if there were errors during the operation.
 * @param {bool} cb.exists Will be true if the item is queued for deletion.
 */
RQTree.prototype.isQueuedForDelete = function (name, cb) {
  var self = this;
  self.rq.getRequests(utils.getParentPath(name), function (err, lookup) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      cb(null, (lookup[utils.getPathName(name)] == 'DELETE'));
    }
  });
};

/**
 * Creates a new File instance from a previously opened File.
 * @param {File} openFile The open file to create a new instance from.
 * @param {Function} cb Will be called when the new instance is created.
 * @param {string|Error} cb.err Will be truthy if there were errors creating the instance.
 * @param {File} cb.file The new file instance.
 */
RQTree.prototype.createFileInstanceFromOpen = function (openFile, cb) {
  RQFile.createInstance(openFile, this, cb);
};

/**
 * Creates a new local file in the tree's cache.
 * @param {string} name The full name of the file to create.
 * @param {function} cb Will be invoked when the file is created.
 * @param {string|Error} cb.err Will be truthy if there were errors.
 * @param {File} cb.file The newly created file.
 */
RQTree.prototype.createLocalFile = function (name, cb) {
  this.local.createFile(name, cb);
};

/**
 * Creates a new directory in the tree's cache.
 * @param {string} name The full name of the directory to create.
 * @param {function} cb Will be invoked when the directory is created.
 * @param {string|Error} cb.err Will be truthy if there were errors.
 * @param {File} cb.file The newly created directory.
 */
RQTree.prototype.createLocalDirectory = function (name, cb) {
  this.local.createDirectory(name, cb);
};

/**
 * Deletes a local file from the tree's cache.
 * @param {string} name The full name of the file to delete.
 * @param {function} cb Will be invoked when the file is deleted.
 * @param {string|Error} cb.err Will be truthy if there were errors.
 */
RQTree.prototype.deleteLocal = function (name, cb) {
  this.local.delete(name, cb);
};

/**
 * Deletes a local directory from the tree's cache.
 * @param {string} name The full name of the directory to delete.
 * @param {function} cb Will be invoked when the directory is deleted.
 * @param {string|Error} cb.err Will be truthy if there were errors.
 */
RQTree.prototype.deleteLocalDirectory = function (name, cb) {
  this.local.deleteDirectory(name, cb);
};

/**
 * Rename a local item the tree's cache.
 * @param {string} oldName The full name of the item to rename.
 * @param {string} newName The full name of the item's new name.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {string|Error} cb.err Will be truthy if there were errors.
 */
RQTree.prototype.renameLocal = function (oldName, newName, cb) {
  this.local.rename(oldName, newName, cb);
};

/**
 * Determines if a path exists locally or not.
 * @param {string} name The full name of the item to check for existence.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {string|Error} cb.err Will be truthy if there were errors.
 * @param {bool} cb.exists Will be true if the item exists, or false otherwise.
 */
RQTree.prototype.existsLocal = function (name, cb) {
  this.local.exists(name, cb);
};

/**
 * Determines if a given path is a local directory or not. It's assumed that the path exists and
 * is valid.
 * @param {string} name The full name of the path to check.
 * @param {function} cb Will be invoked when it's determined whether the path is a directory or not.
 * @param {string|Error} cb.err Will be truthy if there were errors.
 * @param {bool} cb.isDirectory Will be true if the item is a directory, or false otherwise.
 */
RQTree.prototype.isLocalDirectory = function (name, cb) {
  this.local.open(name, function (err, file) {
    if (err) {
      cb(err);
    } else {
      var isDir = file.isDirectory();
      file.close(function (err) {
        if (err) {
          cb(err);
        } else {
          cb(null, isDir);
        }
      });
    }
  });
};

//---------------------------------------------------------------------< Tree >

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
RQTree.prototype.exists = function (name, cb) {
  rqlog.debug('RQTree.exists %s', name);
  logger.debug('[%s] tree.exists %s', this.share.config.backend, name);
  // first check to see if the file exists locally
  var self = this;
  this.local.exists(name, function (err, result) {
    if (err) {
      self.handleErr(cb, err);
    }  else {
      if (result) {
        // if exists locally, return immediately
        cb(null, result);
      } else if (!self.isTempFileName(name)) {
        // make sure the file hasn't been queued for deletion
        self.rq.getRequests(utils.getParentPath('/'), function (err, lookup) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            self.isQueuedForDelete(name, function (err, deleted) {
              if (err) {
                self.handleErr(cb, err);
              } else if (!deleted) {
                // check to see if the file exists remotely
                rqlog.debug('RQTree.exists.remote.exists %s', name);
                self.remote.exists(self.remoteEncodePath(name), function (err, result) {
                  if (err) {
                    self.handleErr(cb, err);
                  } else {
                    cb(null, result);
                  }
                });
              } else {
                // file is queued for deletion
                cb(null, false);
              }
            });
          }
        });
      } else {
        // it's a temp file that doesn't exist
        cb(null, false);
      }
    }
  });
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
RQTree.prototype.open = function (name, cb) {
  rqlog.debug('RQTree.open %s', name);
  logger.debug('[%s] tree.open %s', this.share.config.backend, name);
  var self = this;
  self.local.exists(name, function (err, localExists) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      if (localExists) {
        // local file exists
        self.local.open(name, function (err, localFile) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            self.createFileInstanceFromOpen(localFile, cb);
          }
        });
      } else if (!self.isTempFileName(name)) {
        // local file does not exist
        rqlog.debug('RQTree.open.remote.open %s', name);
        self.remote.open(self.remoteEncodePath(name), function (err, remoteFile) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            self.createFileInstanceFromOpen(remoteFile, cb);
          }
        });
      } else {
        logger.error('[rq] attempting to open path that does not exist %s', name);
        cb(new SMBError(ntstatus.STATUS_NO_SUCH_FILE));
      }
    }
  });
};

/**
 * Uses the tree's share to emit an event indicating that a sync conflict has occurred.
 * @param {String} fileName The full path to the file in conflict.
 */
RQTree.prototype.emitSyncConflict = function (fileName) {
  this.share.emit('syncconflict', { path: fileName });
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
RQTree.prototype.list = function (pattern, cb) {
  rqlog.debug('RQTree.list %s', pattern);
  logger.debug('[%s] tree.list %s', this.share.config.backend, pattern);
  var self = this;

  // adding some optimization. list can receive two types of patterns:
  // 1. request for a directory listing. example: /some/directory/*
  // 2. request for a specific item. example: /some/item
  // only perform the expensive logic for directory listing requests. for individual item requests, just keep
  // it simple.
  var filter = utils.getPathName(pattern);
  if (filter == '*') {
    // first check to see if the directory's listing has already been cached
    var dirPath = utils.getParentPath(pattern);
    self.share.getListCache(dirPath, self, function (err, list) {
      if (err) {
        self.handleErr(cb, err);
      } else if (list) {
        rqlog.debug('RQTree.list %s using cache', pattern);
        // listing has been cached. return as-is
        cb(null, list);
      } else {
        // requesting a fresh directory listing. perform logic to merge remote list with local list, and update locally
        // cached files if needed
        rqlog.debug('RQTree.list.remote.list %s', pattern);
        self.remote.list(pattern, function (err, remoteFiles) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            // this method will convert all remote files into rq files
            var processRemote = function (index, existingRequests, rqFiles, lookup, finishedCb) {
              if (index < remoteFiles.length) {
                if (existingRequests[self.remoteEncodePath(remoteFiles[index].getName())] != 'DELETE') {
                  self.createFileInstanceFromOpen(remoteFiles[index], function (err, newFile) {
                    if (err) {
                      self.handleErr(cb, err);
                    } else {
                      rqFiles.push(newFile);
                      lookup[remoteFiles[index].getName()] = rqFiles.length - 1;
                      processRemote(index + 1, existingRequests, rqFiles, lookup, finishedCb);
                    }
                  });
                } else {
                  processRemote(index + 1, existingRequests, rqFiles, lookup, finishedCb);
                }
              } else {
                finishedCb();
              }
            };

            var parentPath = utils.getParentPath(pattern) || '';
            self.local.exists(parentPath, function (err, exists) {
              if (err) {
                self.handleErr(cb, err);
              } else {
                if (exists) {
                  logger.debug('local directory to list at %s exists, processing local files', pattern);
                  self.local.list(pattern, function (err, localFiles) {
                    if (err) {
                      self.handleErr(cb, err);
                    } else {
                      logger.debug('local directory at %s has %d files', pattern, localFiles.length);
                      self.rq.getRequests(self.remoteEncodePath(parentPath), function (err, requests) {
                        if (err) {
                          self.handleErr(cb, err);
                        } else {
                          var lookup = {};
                          var rqFiles = [];
                          var processLocal = function (index) {
                            if (index < localFiles.length) {
                              if (self.isTempFileName(localFiles[index].getName())) {
                                // it's a temporary file, just add it to the list
                                self.createFileInstanceFromOpen(localFiles[index], function (err, rqFile) {
                                  if (err) {
                                    self.handleErr(cb, err);
                                  } else {
                                    rqFiles.push(rqFile);
                                    processLocal(index + 1);
                                  }
                                });
                              } else {
                                var remoteIndex = lookup[localFiles[index].getName()];
                                if (remoteIndex !== undefined) {
                                  logger.debug('local file %s is present in both local and remote sources. using local info', localFiles[index].getPath());
                                  self.createFileInstanceFromOpen(localFiles[index], function (err, rqFile) {
                                    if (err) {
                                      self.handleErr(cb, err);
                                    } else {
                                      rqFiles[remoteIndex] = rqFile;
                                      processLocal(index + 1);
                                    }
                                  });
                                } else {
                                  logger.debug('local file %s is only local, determining if it should be included', localFiles[index].getPath());
                                  self.createFileInstanceFromOpen(localFiles[index], function (err, rqFile) {
                                    if (err) {
                                      self.handleErr(cb, err);
                                    } else {
                                      logger.debug('checking to see if file %s was created locally', localFiles[index].getPath());
                                      self.isCreatedLocally(localFiles[index].getPath(), function (err, exists) {
                                        if (err) {
                                          self.handleErr(cb, err);
                                        } else {
                                          if (exists) {
                                            logger.debug('local file %s was created locally, including in results', localFiles[index].getPath());
                                            rqFiles.push(rqFile);
                                            processLocal(index + 1);
                                          } else {
                                            logger.debug('local file %s was not created locally, determining if it is safe to delete', localFiles[index].getPath());

                                            // the file was not in the remote list of files, and it doesn't have a local creation
                                            // file indicating that it was created locally. Determine if it's safe to delete and
                                            // do so
                                            self.canDelete(localFiles[index], function (err, canDelete) {
                                              if (err) {
                                                self.handleErr(cb, err);
                                              } else if (canDelete) {
                                                logger.debug('local file %s can be safely deleted locally. deleting', localFiles[index].getPath());
                                                // file can be safely deleted. remove it.
                                                if (rqFile.isDirectory()) {
                                                  self.deleteLocalDirectoryRecursive(rqFile.getPath(), function (err) {
                                                    if (err) {
                                                      self.handleErr(cb, err);
                                                    } else {
                                                      logger.info('directory %s was deleted remotely. exclude from list', rqFile.getPath());
                                                      processLocal(index + 1);
                                                    }
                                                  });
                                                } else {
                                                  self.local.delete(rqFile.getPath(), function (err) {
                                                    if (err) {
                                                      self.handleErr(cb, err);
                                                    } else {
                                                      logger.debug('local file %s was deleted locally. preparing to delete work files', localFiles[index].getPath());
                                                      self.work.delete(localFiles[index].getPath(), function (err) {
                                                        if (err) {
                                                          self.handleErr(cb, err);
                                                        } else {
                                                          logger.info('file %s was deleted remotely. exclude from file list', rqFile.getPath());
                                                          processLocal(index + 1);
                                                        }
                                                      });
                                                    }
                                                  });
                                                }
                                              } else {
                                                // file can't be safely deleted, send conflict event
                                                logger.info('file %s is in conflict because it might need to be deleted. sending event', rqFile.getPath());
                                                rqFiles.push(rqFile);
                                                self.emitSyncConflict(rqFile.getPath());
                                                processLocal(index + 1);
                                              }
                                            });
                                          }
                                        }
                                      });
                                    }
                                  });
                                }
                              }
                            } else {
                              self.share.cacheList(dirPath, rqFiles);
                              cb(null, rqFiles);
                            }
                          };

                          logger.debug('adding %d remote files to list', remoteFiles.length);
                          processRemote(0, requests, rqFiles, lookup, function () {
                            logger.debug('processing %d local files for list', localFiles.length);
                            processLocal(0);
                          });
                        }
                      });
                    }
                  });
                } else {
                  var rqFiles = [];
                  processRemote(0, {}, rqFiles, {}, function () {
                    self.share.cacheList(dirPath, rqFiles);
                    cb(null, rqFiles);
                  });
                }
              }
            });
          }
        });
      }
    });
  } else {
    // requesting an individual item
    var processRq = function (err, files) {
      if (err) {
        self.handleErr(cb, err);
      } else {
        if (files.length) {
          self.createFileInstanceFromOpen(files[0], function (err, rqFile) {
            if (err) {
              self.handleErr(cb, err);
            } else {
              cb(null, [rqFile]);
            }
          });
        } else {
          cb(null, files);
        }
      }
    };
    self.local.exists(pattern, function (err, exists) {
      if (err) {
        self.handleErr(cb, err);
      } else if (exists) {
        // local item exists, use local result
        self.local.list(pattern, processRq);
      } else if (!self.isTempFileName(pattern)) {
        self.isQueuedForDelete(pattern, function (err, deleted) {
          if (err) {
            self.handleErr(cb, err);
          } else if (!deleted) {
            // use remote result
            self.remote.list(pattern, processRq);
          } else {
            // does not exist
            cb(null, []);
          }
        });
      } else {
        // not found
        cb(null, []);
      }
    });
  }
};

/**
 * Refeshes all work files for an RQ file by removing them and re-creating them.
 * @param {String} filePath normalized file path
 * @param {Function} cb Invoked when the refresh is complete.
 * @param {String|Error} cb.err Will be truthy if there was an error during refresh.
 */
RQTree.prototype.refreshWorkFiles = function (filePath, cb) {
  rqlog.debug('RQTree.refreshWorkFiles %s', filePath);
  var self = this;
  logger.debug('refreshing work files for %s', filePath);
  self.work.delete(filePath, function (err) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      self.work.createFileExisting(filePath, function (err) {
        if (err) {
          self.handleErr(cb, err);
        } else {
          cb();
        }
      });
    }
  });
};

/**
 * Determines when the file was last synced.
 * @param {String} path The path to the file whose times should be retrieved.
 * @param {Function} cb Will be invoked once the file's times have been retrieved.
 * @param {String|Error} cb.err Will be truthy if there were errors retrieving the last sync time
 * @param {int} cb.syncTime The timestamp of the last sync date/time. Will be falsy for files that have not been cached (remote files).
 * @param {int} cb.lastModified The timestamp of the last modified date/time. Will be falsy for files that have not been cached (remote files).
 */
RQTree.prototype.getFileTimes = function (path, cb) {
  rqlog.debug('RQTree.getFileTimes %s', path);
  var self = this;
  self.local.exists(path, function (err, exists) {
    if (err) {
      self.handleErr(cb, err);
    } else if (!exists) {
      logger.debug('%s does not exist locally. no sync time', path);
      cb();
    } else {
      self.local.open(path, function (err, localFile) {
        if (err) {
          self.handleErr(cb, err);
        } else {
          if (!self.isTempFileName(path)) {
            self.work.open(path, function (err, syncFile) {
              if (err) {
                self.handleErr(cb, err);
              } else {
                localFile.close(function (err) {
                  if (err) {
                    self.handleErr(cb, err);
                  } else {
                    syncFile.close(function (err) {
                      if (err) {
                        self.handleErr(cb, err);
                      } else {
                        cb(null, syncFile.lastModified(), localFile.lastModified());
                      }
                    });
                  }
                });
              }
            });
          } else {
            cb(null, localFile.created(), localFile.lastModified());
          }
        }
      });
    }
  });
};

/**
 * Determines if a path can be safely deleted
 * @param {File|String} file The path or File instance to analyze.
 * @param {Function} cb Will be invoked once it's been determined if the path can be deleted.
 * @param {String|Error} cb.err Will be truthy if there were errors.
 * @param {Boolean} cb.canDelete Will be true if the path can be safely deleted, otherwise false.
 * @param {Number} cb.lastSynced If defined, will be the timestamp of the last sync time of the file.
 */
RQTree.prototype.canDelete = function (file, cb) {
  var self = this;
  var doWork = function (processFile, workCb) {
    var path = processFile.getPath();
    if (processFile.isDirectory()) {
      logger.debug('%s is a directory, so it can be deleted', path);
      // the file is a directory
      workCb(null, true);
    } else if (self.isTempFileName(path)) {
      logger.debug('%s is a temp file, so it can be deleted', path);
      workCb(null, true);
    } else {
      logger.debug('%s is a file, checking last sync date', path);
      self.work.exists(path, function (err, exists) {
        if (err) {
          self.handleErr(cb, err);
        } else if (!exists) {
          logger.warn('%s work file does not exist', path);
          workCb(null, false);
        } else {
          self.getFileTimes(path, function (err, lastSynced, lastModified) {
            if (err) {
              self.handleErr(cb, err);
            } else {
              var modifiedDiff = lastModified - lastSynced;
              self.isCreatedLocally(path, function (err, exists) {
                if (err) {
                  self.handleErr(cb, err);
                } else {
                  logger.debug('%s: canDelete result based on creation file exists value of %s and modified diff of %d (%d - %d). threshold is %d', path, exists, modifiedDiff, lastModified, lastSynced, self.share.config.modifiedThreshold);
                  // a file can only be safely deleted if it hasn't been modified locally and wasn't created locally
                  workCb(null, (modifiedDiff <= self.share.config.modifiedThreshold) && !exists, lastSynced);
                }
              });
            }
          });
        }
      });
    }
  };

  if ((file instanceof File)) {
    rqlog.debug('RQTree.canDelete %s', file.getPath());
    logger.debug('%s received a File instance to check for deletion safety', file.getPath());
    self.local.exists(file.getPath(), function (err, exists) {
      if (err) {
        self.handleErr(cb, err);
      } else if (!exists) {
        logger.debug('%s has not been cached locally, so it can be deleted', file.getPath());
        cb(null, true);
      } else {
        doWork(file, cb);
      }
    });
  } else {
    rqlog.debug('RQTree.canDelete %s', file);
    logger.debug('%s received a path to check for deletion safety', file);
    // only need to check safety if the file is cached locally
    self.local.exists(file, function (err, exists) {
      if (err) {
        self.handleErr(cb, err);
      } else if (exists) {
        self.local.open(file, function (err, localFile) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            doWork(localFile, function (err, canDelete, lastSynced) {
              localFile.close(function (err) {
                if (err) {
                  self.handleErr(cb, err);
                } else {
                  cb(null, canDelete, lastSynced);
                }
              });
            });
          }
        });
      } else {
        logger.debug('%s has not been cached locally, so it can be deleted', file);
        cb(null, true);
      }
    });
  }
};

/**
 * Recursively removes all files and sub-directories from the local cache, ensuring that conflict files are
 * retained.
 * @param {String} name The name of the directory to process.
 * @param {Function} cb Will be invoked when the deletion is complete.
 * @param {String|Error} cb.err Will be truthy if an error occurred during deletion.
 */
RQTree.prototype.deleteLocalDirectoryRecursive = function (name, cb) {
  rqlog.debug('RQTree.deleteLocalDirectoryRecursive %s', name);
  var self = this;

  logger.debug('recursively removing items in directory %s', name);

  var processDir = function (tree, dirName, itemProcess, finished, ignoreSafety) {
    tree.list(Path.join(dirName, '/*'), function (err, items) {
      if (err) {
        self.handleErr(cb, err);
      } else {
        logger.debug('found %d items in directory %s', items.length, dirName);
        itemProcess(tree, dirName, items, 0, true, finished, ignoreSafety);
      }
    });
  };

  var processItem = function (tree, dirName, items, index, safeDelete, processed, ignoreSafety) {
    if (index < items.length) {
      logger.debug('processing item %s', items[index].getPath());
      if (items[index].isDirectory()) {
        logger.debug('%s is a directory, recursively processing', items[index].getPath());
        processDir(tree, items[index].getPath(), processItem, function (safelyDeleted) {
          logger.debug('finished recursing %s with a safelyDeleted value of %s', items[index].getPath(), safelyDeleted);
          processItem(tree, dirName, items, index + 1, safeDelete && safelyDeleted, processed, ignoreSafety);
        });
      } else {
        var deleteFile = function () {
          if (items[index].getPath() != '/request-queue.nedb') {
            logger.debug('deleting file %s', items[index].getPath());
            tree.delete(items[index].getPath(), function (err) {
              if (err) {
                self.handleErr(cb, err);
              } else {
                processItem(tree, dirName, items, index + 1, safeDelete, processed, ignoreSafety);
              }
            });
          } else {
            processItem(tree, dirName, items, index + 1, safeDelete, processed, ignoreSafety);
          }
        }

        if (ignoreSafety) {
          deleteFile();
        } else {
          self.canDelete(items[index].getPath(), function (err, canDelete) {
            if (err) {
              self.handleErr(cb, err);
            } else if (canDelete) {
              deleteFile();
            } else {
              // can't delete the file
              logger.debug('cannot delete file %s, emitting conflict event', items[index].getPath());
              self.emitSyncConflict(items[index].getPath());
              processItem(tree, dirName, items, index + 1, false, processed, ignoreSafety);
            }
          });
        }
      }
    } else {
      if (safeDelete && dirName != '/') {
        logger.debug('removing directory %s', dirName);
        tree.deleteDirectory(dirName, function (err) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            processed(safeDelete);
          }
        });
      } else {
        logger.debug('cannot remove directory %s because it contains files that cannot be safely deleted', dirName);
        processed(safeDelete);
      }
    }
  };

  processDir(self.local, name, processItem, function () {
    self.work.exists(name, function (err, exists) {
      if (exists) {
        logger.debug('recursively deleting work files for %s', name);
        processDir(self.work, name, processItem, function () {
          cb();
        }, true);
      } else {
        cb();
      }
    });
  });
}

/**
 * Determines if data for the given path has already been queued or not.
 * @param {String} name The name of the file to be checked.
 * @param {Function} cb Will be invoked once existence of the data has been determined.
 * @param {Error|String} cb.err Will be truthy if an error occurred.
 * @param {Bool} cb.exists Will be true if the path exists in the queue, otherwise false.
 */
RQTree.prototype.queueDataExists = function (name, cb) {
  var self = this;
  var encoded = self.remoteEncodePath(name);
  self.rq.exists(utils.getParentPath(encoded), utils.getPathName(encoded), cb);
};

/**
 * Queues a request in the backend request queue.
 * @param {String} name The name of the file to be queued.
 * @param {String} method The HTTP method to queue.
 * @param [String] newName The new name of the file, which is required for move or copy
 * @param {Function} cb Will be invoked when the data has been queued.
 * @param {String|Error} cb.err Will be truthy if there were problems queueing the data.
 */
RQTree.prototype.queueData = function (name, method, newName, moreOpts, cb) {
  rqlog.debug('RQTree.queueData [%s] [%s]', name, method);
  var isTempFile = this.isTempFileName(name);
  var self = this;
  var options = {
    method: method,
    path: self.remoteEncodePath(name),
    remotePrefix: this.share.buildResourceUrl(''),
    localPrefix: this.share.config.local.path
  };
  if (!cb) {
    cb = moreOpts;
  } else {
    options.replace = moreOpts.replace;
  }

  if (newName) {
    options['destPath'] = newName;

    if (isTempFile && !this.isTempFileName(newName)) {
      // handle special case of temp files being renamed/copied to non-temp files
      if (options.replace) {
        options.method = 'POST';
      } else {
        options.method = 'PUT';
      }
      options.path = newName;
      options.destPath = undefined;
      isTempFile = false;
    } else if (!isTempFile && this.isTempFileName(newName) && method == 'MOVE') {
      // handle special case of non-temp files being renamed to temp files
      options.method = 'DELETE';
      options.destPath = undefined;
      isTempFile = false;
    } else {
      isTempFile = isTempFile || this.isTempFileName(newName);
    }
  }
  if (!isTempFile) {
    this.rq.queueRequest(options, function (err) {
      if (err) {
        logger.error('unable to queue request', options, err);
        self.handleErr(cb, err);
      } else {
        cb();
      }
    });
  } else {
    cb();
  }
};

/**
 * Retrieves the name of the file used to indicate that a file was created locally.
 * @returns {String} The name of the create file.
 */
RQTree.prototype.getCreateFileName = function (name) {
  return name + '.rqcf';
}

/**
 * Retrieves a value indicating whether a locally cached file was created locally.
 * @param {String} name normalized file path.
 * @param {Function} cb Will be invoked with result.
 * @param {String|Error} cb.err Will be truthy if there were problems retrieving the value.
 * @param {bool} cb.created Will be true if the file was created locally, otherwise false.
 */
RQTree.prototype.isCreatedLocally = function (name, cb) {
  rqlog.debug('RQTree.isCreatedLocally %s', name);
  var self = this;
  self.work.exists(self.getCreateFileName(name), function (err, exists) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      cb(null, exists);
    }
  });
}

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
RQTree.prototype.createFile = function (name, cb) {
  rqlog.debug('RQTree.createFile %s', name);
  logger.debug('[%s] tree.createFile %s', this.share.config.backend, name);
  var self = this;
  self.createLocalFile(name, function (err, file) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      self.share.invalidateContentCache(utils.getParentPath(name), true);
      self.work.createFile(name, function (err) {
        if (err) {
          self.handleErr(cb, err);
        } else {
          self.createFileInstanceFromOpen(file, cb);
        }
      });
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
RQTree.prototype.createDirectory = function (name, cb) {
  rqlog.debug('RQTree.createDirectory %s', name);
  logger.debug('[%s] tree.createDirectory %s', this.share.config.backend, name);
  var self = this;
  self.createLocalDirectory(name, function (err, file) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      // create directory immediately
      self.share.invalidateContentCache(utils.getParentPath(name), true);
      self.remote.createDirectory(self.remoteEncodePath(name), function (err, remoteDir) {
        if (err) {
          self.handleErr(cb, err);
        } else {
          self.createFileInstanceFromOpen(file, cb);
        }
      });
    }
  });
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQTree.prototype.delete = function (name, cb) {
  rqlog.debug('RQTree.delete %s', name);
  logger.debug('[%s] tree.delete %s', this.share.config.backend, name);
  var self = this;
  self.existsLocal(name, function (err, exists) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      self.share.invalidateContentCache(utils.getParentPath(name), true);
      if (exists) {
        self.deleteLocal(name, function (err) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            self.isCreatedLocally(name, function (err, createExists) {
              if (err) {
                self.handleErr(cb, err);
              } else {
                self.work.delete(name, function (err) {
                  if (err) {
                    self.handleErr(cb, err);
                  } else {
                    self.queueDataExists(name, function (err, queueExists) {
                      if (err) {
                        self.handleErr(cb, err);
                      } else {
                        if (!createExists || queueExists) {
                          self.queueData(name, 'DELETE', false, function (err) {
                            if (err) {
                              logger.error('unexpected error while trying to queue delete', err);
                            }
                            cb();
                          });
                        } else {
                          cb();
                        }
                      }
                    });
                  }
                });
              }
            });
          }
        });
      } else if (!self.isTempFileName(name)) {
        logger.debug('%s to delete does not exist locally, just queueing request', name);
        self.queueData(name, 'DELETE', false, function (err) {
          if (err) {
            logger.error('unexpected error while trying to queue remote-only delete', err);
          }
          cb();
        });
      } else {
        logger.error('[rq] attempting to delete path %s, which does not exist', name);
        self.handleErr(cb, 'path ' + name + ' to delete does not exist');
      }
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
RQTree.prototype.deleteDirectory = function (name, cb) {
  rqlog.debug('RQTree.deleteDirectory %s', name);
  logger.debug('[%s] tree.deleteDirectory %s', this.share.config.backend, name);
  var self = this;
  self.existsLocal(name, function (err, exists) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      self.share.invalidateContentCache(utils.getParentPath(name), true);
      if (exists) {
        self.deleteLocalDirectory(name, function (err) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            self.remote.deleteDirectory(self.remoteEncodePath(name), function (err) {
              if (err) {
                self.handleErr(cb, err);
              } else {
                self.rq.removePath(self.remoteEncodePath(name), function (err) {
                  if (err) {
                    self.handleErr(cb, err);
                  } else {
                    self.work.exists(name, function (err, exists) {
                      if (err) {
                        self.handleErr(cb, err);
                      } else {
                        if (exists) {
                          self.work.deleteDirectory(name, cb);
                        } else {
                          cb();
                        }
                      }
                    });
                  }
                });
              }
            });
          }
        });
      } else {
        self.remote.deleteDirectory(self.remoteEncodePath(name), cb);
      }
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
RQTree.prototype.rename = function (oldName, newName, cb) {
  rqlog.debug('RQTree.rename [%s] [%s]', oldName, newName);
  logger.debug('[%s] tree.rename %s to %s', this.share.config.backend, oldName, newName);
  var self = this;
  self.existsLocal(oldName, function (err, exists) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      // only attempt to rename the item in the local cache if it already exists
      if (exists) {
        logger.debug('%s exists locally, preparing to rename', oldName);
        self.isLocalDirectory(oldName, function (err, isDirectory) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            self.existsLocal(newName, function (err, targetExists) {
              if (err) {
                cb(err);
              } else {
                self.renameLocal(oldName, newName, function (err) {
                  if (err) {
                    self.handleErr(cb, err);
                  } else {
                    logger.debug('%s successfully renamed to %s', oldName, newName);
                    // invalidate cache
                    self.share.invalidateContentCache(utils.getParentPath(oldName), true);
                    self.share.invalidateContentCache(utils.getParentPath(newName), true);

                    if (isDirectory) {
                      logger.debug('%s is a directory, preparing to rename remotely', oldName);
                      self.work.renameDirectory(oldName, newName, function (err) {
                        if (err) {
                          self.handleErr(cb, err);
                        } else {
                          self.remote.rename(self.remoteEncodePath(oldName), self.remoteEncodePath(newName), function (err) {
                            if (err) {
                              self.handleErr(cb, err);
                            } else {
                              logger.debug('%s successfully renamed to %s remotely', oldName, newName);
                              self.rq.updatePath(self.remoteEncodePath(oldName), self.remoteEncodePath(newName), function (err) {
                                if (err) {
                                  self.handleErr(cb, err);
                                } else {
                                  logger.debug('successfully updated queued requests for %s to %s', oldName, newName);
                                  self.handleErr(cb);
                                }
                              });
                            }
                          });
                        }
                      });
                    } else {
                      self.work.rename(oldName, newName, function (err) {
                        if (err) {
                          self.handleErr(cb, err);
                        } else {
                          logger.debug('%s is a file, preparing to queue request', oldName);
                          self.queueData(oldName, 'MOVE', newName, {replace: targetExists}, function (err) {
                            if (err) {
                              self.handleErr(cb, err);
                            } else {
                              logger.debug('successfully queued MOVE for %s -> %s', oldName, newName);
                              self.handleErr(cb);
                            }
                          });
                        }
                      });
                    }
                  }
                });
              }
            });
          }
        });
      } else if (!self.isTempFileName(oldName)) {
        self.remote.rename(self.remoteEncodePath(oldName), self.remoteEncodePath(newName), cb);
      } else {
        logger.warn('attempting to rename temp file %s, which does not exist', oldName);
        this.handleErr(cb, 'cannot rename non-existing temp file ' + oldName);
      }
    }
  });
};

/**
 * Disconnects the rq tree and all of its subtrees.
 * @param {Function} cb Will be invoked when the disconnect is complete.
 * @param {Array} cb.err Will be truthy if there was an error disconnecting. Will be an array of errors.
 */
RQTree.prototype.disconnect = function (cb) {
  rqlog.debug('RQTree.disconnect');
  var self = this;
  if (!self.options.noprocessor) {
    self.processor.stop();
  }
  self.remote.disconnect(function (remoteErr) {
    self.local.disconnect(function (localErr) {
      self.work.disconnect(function (workErr) {
        if (remoteErr || localErr || workErr) {
          var err = [];
          if (remoteErr) {
            err.push(remoteErr);
          }
          if (localErr) {
            err.push(localErr);
          }
          if (workErr) {
            err.push(workErr);
          }
          processCb(err);
        } else {
          cb();
        }
      });
    });
  });
};

/**
 * Clears the tree's local cache.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {string|Error} cb.err Will be truthy if the operation fails.
 */
RQTree.prototype.clearCache = function (cb) {
  this.deleteLocalDirectoryRecursive('/', cb);
};

module.exports = RQTree;
