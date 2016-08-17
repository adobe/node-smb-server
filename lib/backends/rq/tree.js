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

var Tree = require('../../spi/tree')
var FSShare = require('../fs/share');
var FSTree = require('../fs/tree');
var DAMTree = require('../dam/tree');
var RQFile = require('./file');
var FSFile = require('../fs/file');
var Path = require('path');
var request = require('request');
var utils = require('../../utils');
var RequestQueue = require('./requestqueue');
var RQProcessor = require('./rqprocessor');

/**
 * Creates an instance of RQTree.
 *
 * @constructor
 * @this {RQTree}
 * @param {RQShare} share parent share
 * @param {Tree} remote The tree to use for remote operations.
 * @param {Tree} tempFilesTree temporary files tree
 * @param {Object} options Options for controlling the tree.
 */
var RQTree = function (share, remote, options) {
  if (!(this instanceof RQTree)) {
    return new RQTree(share, content, tempFilesTree);
  }
  options = options || {};
  if (!options.localTree) {
    options.localTree = new FSTree(new FSShare('rqlocal', share.config.local));
  }
  if (!options.workTree) {
    options.workTree = new FSTree(new FSShare('rqwork', share.config.work));
  }
  this.remote = remote;
  this.local = options.localTree;
  this.work = options.workTree;
  this.share = share;
  this.rq = new RequestQueue({
    path: share.config.work.path,
    db: options.rqdb
  });
  this.createdFiles = {};
  this.processor = new RQProcessor(this, this.rq);

  this.processor.on('syncstart', function (data) {
    logger.info('start sync %s %s', data.method, data.file);
    share.emit('syncstart', data);
  });

  this.processor.on('syncend', function (data) {
    logger.info('end sync %s %s', data.method, data.file);
    share.emit('syncend', data);
  });

  this.processor.on('syncerr', function (data) {
    logger.error('err sync %s %s', data.method, data.file, data.err);
    share.emit('syncerr', data);
  });

  this.processor.on('error', function (err) {
    logger.error('there was a general error in the processor', err);
    share.emit('error', err);
  });

  this.processor.on('purged', function (purged) {
    logger.info('failed files were purged from the queue', purged);
    share.emit('purged', purged);
  });

  if (!options.noprocessor) {
    this.processor.start(share.config);
  }

  Tree.call();
};

// the RQTree prototype inherits from Tree
util.inherits(RQTree, Tree);

RQTree.prototype.getLocalPath = function (name) {
  return Path.join(this.share.config.local.path, name);
}

RQTree.prototype.getRemotePath = function (name) {
  return this.share.buildResourceUrl(name);
}

RQTree.prototype.isTempFileName = function (name) {
  return this.remote.isTempFileName(name);
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
  logger.debug('[%s] tree.exists %s', this.share.config.backend, name);
  // first check to see if the file exists locally
  var self = this;
  this.local.exists(name, function (err, result) {
    if (err) {
      cb(err);
    }  else {
      if (result) {
        // if exists locally, return immediately
        cb(null, result);
      } else {
        // otherwise check to see if the file exists remotely
        self.remote.exists(name, function (err, result) {
          if (err) {
            cb(err);
          } else {
            cb(null, result);
          }
        });
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
  logger.debug('[%s] tree.open %s', this.share.config.backend, name);
  var self = this;
  self.remote.exists(name, function (err, remoteExists) {
    if (err) {
      cb(err);
    } else {
      self.local.exists(name, function (err, localExists) {
        if (err) {
          cb(err);
        } else {
          if (remoteExists && !localExists) {
            // remote file exists but local does not
            RQFile.createInstance(name, self, cb);
          } else {
            // local file exists
            self.local.open(name, function (err, localFile) {
              if (err) {
                cb(err);
              } else {
                if (!remoteExists) {
                  // local file only exists
                  RQFile.createInstanceFromLocal(name, self, localFile, cb);
                } else {
                  // both local and remote exist
                  self.remote.open(name, function (err, remoteFile) {
                    if (err) {
                      cb(err);
                    } else {
                      RQFile.createInstanceFromLocalAndRemote(name, self, localFile, remoteFile, cb);
                    }
                  });
                }
              }
            });
          }
        }
      });
    }
  });
};

/**
 * Uses the tree's share to emit an event indicating that a sync conflict has occurred.
 * @param {String} fileName The full path to the file in conflict.
 */
RQTree.prototype.emitSyncConflict = function (fileName) {
  this.share.emit('syncconflict', { file: fileName });
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
  logger.debug('[%s] tree.list %s', this.share.config.backend, pattern);
  var self = this;
  self.remote.list(pattern, function (err, remoteFiles) {
    if (err) {
      cb(err);
    } else {
      var parentPath = utils.getParentPath(pattern) || '';
      self.local.exists(parentPath, function (err, exists) {
        if (err) {
          cb(err);
        } else {
          if (exists) {
            logger.debug('local directory to list at %s exists, processing local files', pattern);
            self.local.list(pattern, function (err, localFiles) {
              if (err) {
                cb(err);
              } else {
                logger.debug('local directory at %s has %d files', pattern, localFiles.length);
                self.rq.getRequests(parentPath, function (err, requests) {
                  if (err) {
                    cb(err);
                  } else {
                    var i;
                    var lookup = {};
                    var remoteLookup = {};
                    var rqFiles = [];
                    logger.debug('adding %d remote files to list', remoteFiles.length);
                    for (i = 0; i < remoteFiles.length; i++) {
                      if (requests[remoteFiles[i].getName()] != 'DELETE') {
                        rqFiles.push(RQFile.createInstanceFromRemote(remoteFiles[i].getPath(), self, remoteFiles[i]));
                        lookup[remoteFiles[i].getName()] = rqFiles.length - 1;
                        remoteLookup[remoteFiles[i].getName()] = i;
                      }
                    }

                    var processLocal = function (index) {
                      if (index < localFiles.length) {
                        if (self.isTempFileName(localFiles[index].getName())) {
                          // it's a temporary file, just add it to the list
                          RQFile.createInstanceFromLocal(localFiles[index].getPath(), self, localFiles[index], function (err, rqFile) {
                            if (err) {
                              cb(err);
                            } else {
                              rqFiles.push(rqFile);
                              processLocal(index + 1);
                            }
                          });
                        } else {
                          var remoteIndex = lookup[localFiles[index].getName()];
                          var origRemoteIndex = remoteLookup[localFiles[index].getName()];
                          if (remoteIndex !== undefined) {
                            logger.debug('local file %s is present in both local and remote sources. using local info', localFiles[index].getPath());
                            RQFile.createInstanceFromLocalAndRemote(localFiles[index].getPath(), self, localFiles[index], remoteFiles[origRemoteIndex], function (err, rqFile) {
                              if (err) {
                                cb(err);
                              } else {
                                rqFiles[remoteIndex] = rqFile;
                                processLocal(index + 1);
                              }
                            });
                          } else {
                            logger.debug('local file %s is only local, determining if it should be included', localFiles[index].getPath());
                            RQFile.createInstanceFromLocal(localFiles[index].getPath(), self, localFiles[index], function (err, rqFile) {
                              if (err) {
                                cb(err);
                              } else {
                                logger.debug('checking to see if file %s was created locally', localFiles[index].getPath());
                                self.work.exists(self.getCreateFileName(localFiles[index].getPath()), function (err, exists) {
                                  if (err) {
                                    cb(err);
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
                                      rqFile.canDelete(function (err, canDelete) {
                                        if (err) {
                                          cb(err);
                                        } else if (canDelete) {
                                          logger.debug('local file %s can be safely deleted locally. deleting', localFiles[index].getPath());
                                          // file can be safely deleted. remove it.
                                          rqFile.delete(function (err) {
                                            if (err) {
                                              cb(err);
                                            } else {
                                              logger.debug('local file %s was deleted locally. preparing to delete work files', localFiles[index].getPath());
                                              RQFile.deleteWorkFiles(localFiles[index].getPath(), self, function (err) {
                                                if (err) {
                                                  cb(err);
                                                } else {
                                                  logger.info('file %s was deleted remotely. exclude from file list', rqFile.getPath());
                                                  processLocal(index + 1);
                                                }
                                              });
                                            }
                                          });
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
                        cb(null, rqFiles);
                      }
                    };

                    logger.debug('processing %d local files for list', localFiles.length);
                    processLocal(0);
                  }
                });
              }
            });
          } else {
            cb(null, remoteFiles);
          }
        }
      });
    }
  });
};

/**
 * Queues a request in the backend request queue.
 * @param {String} name The name of the file to be queued.
 * @param {String} method The HTTP method to queue.
 * @param [String] newName The new name of the file, which is required for move or copy
 */
RQTree.prototype.queueData = function (name, method, newName, cb) {
  var isTempFile = this.isTempFileName(name);
  var options = {
    method: method,
    path: name,
    remotePrefix: this.share.buildResourceUrl(''),
    localPrefix: this.share.config.local.path
  };
  if (newName) {
    options['destPath'] = newName;
    isTempFile = isTempFile && this.isTempFileName(newName);
  }
  if (!isTempFile) {
    this.rq.queueRequest(options, function (err) {
      if (err) {
        logger.error('unable to queue request', options, err);
        cb(err);
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
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
RQTree.prototype.createFile = function (name, cb) {
  logger.debug('[%s] tree.createFile %s', this.share.config.backend, name);
  var self = this;
  self.local.createFile(name, function (err, file) {
    if (err) {
      cb(err);
    } else {
      self.work.createFile(self.getCreateFileName(name), function (err, createdFile) {
        if (err) {
          cb(err);
        } else {
          self.createdFiles[name] = true;
          self.share.invalidateContentCache(utils.getParentPath(name), true);
          RQFile.createInstanceFromLocal(name, self, file, cb);
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
  logger.debug('[%s] tree.createDirectory %s', this.share.config.backend, name);
  var self = this;
  self.local.createDirectory(name, function (err, file) {
    if (err) {
      cb(err);
    } else {
      // create directory immediately
      self.remote.createDirectory(name, cb);
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
   logger.info('[%s] tree.delete %s', this.share.config.backend, name);
   var self = this;
   self.local.exists(name, function (err, exists) {
     if (err) {
       cb(err);
     } else {
       if (exists) {
         self.local.delete(name, function (err) {
           if (err) {
             cb(err);
           } else {
             self.work.exists(self.getCreateFileName(name), function (err, createExists) {
               if (err) {
                 cb(err);
               } else {
                 self.rq.exists(utils.getParentPath(name), utils.getPathName(name), function (err, queueExists) {
                   if (err) {
                     cb(err);
                   } else {
                     self.share.invalidateContentCache(utils.getParentPath(name), true);
                     RQFile.deleteWorkFiles(name, self, function (err) {
                       if (err) {
                         logger.error('unexpected error while trying to clean up rq file after deletion', err);
                       }
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
                     });
                   }
                 });
               }
             });
           }
         });
       } else {
         logger.debug('%s to delete does not exist locally, just queueing request', name);
         self.share.invalidateContentCache(utils.getParentPath(name), true);
         self.queueData(name, 'DELETE', false, function (err) {
           if (err) {
             logger.error('unexpected error while trying to queue remote-only delete', err);
           }
           cb();
         });
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
  logger.debug('[%s] tree.deleteDirectory %s', this.share.config.backend, name);
  var self = this;
  self.local.exists(name, function (err, exists) {
    if (err) {
      cb(err);
    } else {
      if (exists) {
        self.local.deleteDirectory(name, function (err) {
          if (err) {
            cb(err);
          } else {
            self.remote.deleteDirectory(name, function (err) {
              if (err) {
                cb(err);
              } else {
                self.rq.removePath(name, function (err) {
                  if (err) {
                    cb(err);
                  } else {
                    self.work.exists(name, function (err, exists) {
                      if (err) {
                        cb(err);
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
        self.remote.deleteDirectory(name, cb);
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
  logger.debug('[%s] tree.rename %s to %s', this.share.config.backend, oldName, newName);
  var self = this;
  self.local.exists(oldName, function (err, exists) {
    if (err) {
      cb(err);
    } else {
      // only attempt to rename the item in the local cache if it already exists
      if (exists) {
        logger.debug('%s exists locally, preparing to rename', oldName);
        self.local.rename(oldName, newName, function (err) {
          if (err) {
            cb(err);
          } else {
            logger.debug('%s successfully renamed to %s', oldName, newName);
            // invalidate cache
            self.share.invalidateContentCache(utils.getParentPath(oldName), true);
            self.share.invalidateContentCache(utils.getParentPath(newName), true);
            self.local.createFileInstance(newName, self.local, function (err, file) {
              if (err) {
                cb(err);
              } else {
                if (file.isDirectory()) {
                  logger.debug('%s is a directory, preparing to rename remotely', oldName);
                  self.remote.rename(oldName, newName, function (err) {
                    if (err) {
                      cb(err);
                    } else {
                      logger.debug('%s successfully renamed to %s remotely', oldName, newName);
                      self.rq.updatePath(oldName, newName, function (err) {
                        if (err) {
                          cb(err);
                        } else {
                          logger.debug('successfully updated queued requests for %s to %s', oldName, newName);
                          cb();
                        }
                      });
                    }
                  });
                } else {
                  self.work.exists(oldName, function (err, exists) {
                    if (err) {
                      cb(err);
                    } else {
                      self.work.exists(self.getCreateFileName(oldName), function (err, createdExists) {
                        if (err) {
                          cb(err);
                        } else {
                          var queueRename = function () {
                            logger.debug('%s is a file, preparing to queue request', oldName);
                            self.queueData(oldName, 'MOVE', newName, function (err) {
                              if (err) {
                                cb(err);
                              } else {
                                logger.debug('successfully queued MOVE for %s -> %s', oldName, newName);
                                cb();
                              }
                            });
                          };

                          var renameCreated = function () {
                            if (exists) {
                              logger.debug('%s create date file exists, preparing to rename', oldName);
                              self.work.rename(oldName, newName, function (err) {
                                if (err) {
                                  cb(err);
                                } else {
                                  queueRename();
                                }
                              });
                            } else {
                              queueRename();
                            }
                          };

                          if (createdExists) {
                            logger.debug('%s created file exists, preparing to rename', oldName);
                            self.work.rename(self.getCreateFileName(oldName), self.getCreateFileName(newName), function (err) {
                              if (err) {
                                cb(err);
                              } else {
                                renameCreated();
                              }
                            });
                          } else {
                            renameCreated();
                          }
                        }
                      });
                    }
                  });
                }
              }
            });
          }
        });
      } else {
        self.remote.rename(oldName, newName, cb);
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
  var self = this;
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
            cb(err);
          } else {
            cb();
          }
        });
      });
  });
};

module.exports = RQTree;
