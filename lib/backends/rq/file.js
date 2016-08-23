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
var fs = require('fs');
var Path = require('path');
var ntstatus = require('../../ntstatus');

var logger = require('winston').loggers.get('spi');

var File = require('../../spi/file');
var DAMFile = require('../dam/file');
var SMBError = require('../../smberror');
var FSFile = require('../fs/file');
var Path = require('path');
var utils = require('../../utils');

/**
 * Creates an instance of File.
 *
 * @constructor
 * @private
 * @this {RQFile}
 * @param {String} filePath normalized file path
 * @param {RQTree} tree tree object
 */
var RQFile = function (openFile, tree) {
  logger.debug('[rq] file.construct %s', openFile.getPath());
  if (!(this instanceof RQFile)) {
    return new RQFile(openFile, tree);
  }
  this.filePath = openFile.getPath();
  this.openFile = openFile;
  this.tree = tree;
  this.remote = tree.remote;
  this.local = tree.local;
  this.work = tree.work;
  this.dirty = false;
  this.syncDone = false;

  File.call(this, this.filePath, tree);
};

// the RQFile prototype inherits from File
util.inherits(RQFile, File);

/**
 * Async factory method for initializing a new RQFile from a remote file.
 *
 * @param {String} filePath normalized file path
 * @param {RQTree} tree tree object
 * @param {Function} cb callback called with the bytes actually read
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {RQFile} cb.file RQFile instance
 */
RQFile.createInstance = function (openFile, tree, cb) {
  cb(null, new RQFile(openFile, tree));
};

/**
 * If necessary, caches a remote file locally for use in cached operations.
 * @param {Function} cb callback called after caching is complete
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file File instance for consumption
 */
RQFile.prototype.cacheFile = function(cb) {
  var self = this;

  if (self.syncDone) {
    logger.debug('%s sync already done for this file instance. returning currently open file', self.filePath);
    cb(null, self.openFile);
  } else if (self.tree.isTempFileName(self.filePath)) {
    logger.debug('%s is a temporary file, do not attempt to cache it', self.filePath);
    cb(null, self.openFile);
  } else {
    self.syncDone = true;
    // first, determine if a local cache of the file already exists
    self.local.exists(self.filePath, function (err, exists) {
      if (err) {
        cb(err);
      } else if(exists) {
        // local cached file exists. determine if it was created locally or is cached from remote
        logger.debug('%s to cache exists locally', self.filePath);
        self.local.open(self.filePath, function (err, localFile) {
          if (err) {
            cb(err);
          } else {
            if (localFile.lastModified() == self.lastModified()) {
              logger.debug('%s file in cache is the same as in-memory, using in-memory', self.getPath());
              var currOpenFile = self.openFile;
              self.openFile = localFile;
              localFile = currOpenFile;
            }
            self.openFile.close(function (err) {
              if (err) {
                cb(err);
              } else {
                self.openFile = localFile;
                self.tree.isCreatedLocally(self.filePath, function (err, createdLocal) {
                  if (err) {
                    cb(err);
                  } else if (createdLocal) {
                    logger.debug('file %s was created locally, returning cached file', self.filePath);
                    cb(null, localFile);
                  } else {
                    logger.debug('file %s was cached from remote, check to see if it needs to be updated', self.filePath);
                    self.tree.canDelete(self, function (err, canDelete, lastSynced) {
                      if (err) {
                        cb(err);
                      } else if (!canDelete) {
                        logger.debug('file %s cannot be safely deleted. check to see if it is in the queue', self.filePath);
                        self.tree.rq.exists(utils.getParentPath(self.getPath()), self.getName(), function (err, exists) {
                          if (err) {
                            cb(err);
                          } else {
                            if (!exists) {
                              logger.debug('file %s is not queued, send conflict event', self.filePath);
                              self.tree.emitSyncConflict(self.filePath);
                            }
                            cb(null, localFile);
                          }
                        });
                      } else {
                        logger.debug('file %s can be safely deleted. check to see if it needs to be re-synced', self.filePath);
                        self.remote.open(self.filePath, function (err, remoteFile) {
                          if (err) {
                            cb(err);
                          } else {
                            var remoteModified = remoteFile.lastModified();
                            // check if the remote version has been modified since it was cached
                            if ((Math.abs(remoteModified - lastSynced) > 1000) && remoteModified > lastSynced) {
                              logger.info('file %s has been modified remotely (%d) since it was last synced (%d). re-syncing', self.filePath, remoteModified, lastSynced);
                              localFile.close(function (err) {
                                if (err) {
                                  cb(err);
                                } else {
                                  remoteFile.close(function (err) {
                                    if (err) {
                                      cb(err);
                                    } else {
                                      self.local.delete(self.filePath, function (err) {
                                        if (err) {
                                          cb(err);
                                        } else {
                                          self.tree.deleteWorkFiles(self.filePath, function (err) {
                                            if (err) {
                                              cb(err);
                                            } else {
                                              self.syncDone = false;
                                              self.cacheFile(cb);
                                            }
                                          });
                                        }
                                      });
                                    }
                                  });
                                }
                              });
                            } else {
                              logger.debug('file %s has not been modified remotely (%d) since it was last synced (%d). using cache.', self.filePath, remoteModified, lastSynced);
                              cb(null, localFile);
                            }
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
      } else {
        logger.debug('local file %s does not exist. fetching from remote', self.filePath);
        self.tree.share.fetchResource(self.filePath, function (err, localPath) {
          if (err) {
            cb(err);
          } else {
            logger.debug('successfully completed initial cache of %s to %s', self.filePath, localPath);
            self.local.open(self.filePath, function (err, file) {
              if (err) {
                cb(err);
              } else {
                self.openFile = file;
                self.tree.createSyncFile(self, function (err) {
                  if (err) {
                    cb(err);
                  } else {
                    logger.debug('recorded initial sync time of file %s', self.filePath);
                    cb(null, file);
                  }
                });
              }
            });
          }
        });
      }
    });
  }
};

//---------------------------------------------------------------------< File >

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
RQFile.prototype.isFile = function () {
  return this.openFile.isFile();
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
RQFile.prototype.isDirectory = function () {
  return this.openFile.isDirectory();
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
RQFile.prototype.isReadOnly = function () {
  return this.openFile.isReadOnly();
};

/**
 * Return the file size.
 *
 * @return {Number} file size, in bytes
 */
RQFile.prototype.size = function () {
  return this.openFile.size();
};

/**
 * Return the number of bytes that are allocated to the file.
 *
 * @return {Number} allocation size, in bytes
 */
RQFile.prototype.allocationSize = function () {
  return this.openFile.allocationSize();
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last modification
 */
RQFile.prototype.lastModified = function () {
  return this.openFile.lastModified();
};

/**
 * Sets the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @param {Number} ms
 * @return {Number} time of last modification
 */
RQFile.prototype.setLastModified = function (ms) {
  this.openFile.setLastModified(ms);
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
RQFile.prototype.lastChanged = function () {
  return this.openFile.lastChanged();
};

/**
 * Return the create time, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
RQFile.prototype.created = function () {
    return this.openFile.created();
};

/**
 * Return the time of last access, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
RQFile.prototype.lastAccessed = function () {
  return this.openFile.lastAccessed();
};

/**
 * Read bytes at a certain position inside the file.
 *
 * @param {Buffer} buffer the buffer that the data will be written to
 * @param {Number} offset the offset in the buffer to start writing at
 * @param {Number} length the number of bytes to read
 * @param {Number} position offset where to begin reading from in the file
 * @param {Function} cb callback called with the bytes actually read
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Number} cb.bytesRead number of bytes actually read
 * @param {Buffer} cb.buffer buffer holding the bytes actually read
 */
RQFile.prototype.read = function (buffer, offset, length, position, cb) {
  this.cacheFile(function (err, file) {
    if (err) {
      cb(err);
    } else {
      file.read(buffer, offset, length, position, cb);
    }
  });
};

/**
 * Write bytes at a certain position inside the file.
 *
 * @param {Buffer} data buffer to write
 * @param {Number} position position inside file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQFile.prototype.write = function (data, position, cb) {
  var self = this;
  this.cacheFile(function (err, file) {
    if (err) {
      cb(err);
    } else {
      file.write(data, position, function (err) {
        if (err) {
          cb(err);
        } else {
          self.dirty = true;
          cb(null);
        }
      });
    }
  });
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQFile.prototype.setLength = function (length, cb) {
  var self = this;
  this.cacheFile(function (err, file) {
    if (err) {
      cb(err);
    } else {
      self.dirty = true;
      file.setLength(length, cb);
    }
  });
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQFile.prototype.delete = function (cb) {
  var self = this;
  logger.debug('deleting file %s', self.getPath());

  var sendResult = function(err) {
    if (err) {
      logger.debug('failed to delete', self.getPath());
      cb(err);
    } else {
      logger.debug('successfully deleted %s', self.getPath());
      self.dirty = false;
      cb();
    }
  };

  if (self.isDirectory()) {
    self.tree.deleteDirectory(self.getPath(), function (err) {
      sendResult(err);
    });
  } else {
    self.tree.delete(self.getPath(), function (err) {
      sendResult(err);
    });
  }
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQFile.prototype.flush = function (cb) {
  this.cacheFile(function (err, file) {
    if (err) {
      cb(err);
    } else {
      file.flush(cb);
    }
  });
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQFile.prototype.close = function (cb) {
  var self = this;
  this.openFile.close(function (err) {
    if (err) {
      cb(err);
    } else {
      if (self.dirty) {
        logger.debug('%s is dirty, queueing method', self.getPath());
        if (self.tree.createdFiles[self.getPath()]) {
          logger.debug('%s is newly created, queuing creation', self.getPath());
          self.tree.createdFiles[self.getPath()] = false;
          self.tree.queueData(self.getPath(), 'PUT', false, cb);
        } else {
          logger.debug('%s is being updated, queuing update', self.getPath());
          self.tree.queueData(self.getPath(), 'POST', false, cb);
        }
      } else {
        logger.debug('%s is not dirty, closing', self.getPath());
        cb();
      }
    }
  });
};

module.exports = RQFile;
