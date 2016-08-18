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
var RQFile = function (filePath, tree, damFile, localFile) {
  logger.debug('[rq] file.open %s', filePath);
  if (!(this instanceof RQFile)) {
    return new RQFile(filePath, tree, damFile, localFile);
  }
  this.filePath = filePath;
  this.tree = tree;
  this.local = tree.local;
  this.work = tree.work;
  if (localFile) {
    this.localFile = localFile;
  }

  if (damFile) {
    this.damFile = damFile;
  }
  this.dirty = false;

  File.call(this, filePath, tree);
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
RQFile.createInstance = function (filePath, tree, cb) {
  tree.remote.createFileInstance(filePath, null, -1, function (err, remoteFile) {
    if (err) {
      cb(err);
    } else {
      cb(null, RQFile.createInstanceFromRemote(filePath, tree, remoteFile));
    }
  });
};

/**
 * Deletes all associated work files of an RQ file.
 * @param {String} filePath normalized file path
 * @param {RQTree} tree tree object
 * @param {Function} cb Invoked when the deletion is complete.
 * @param {String|Exception} cb.err Will be truthy if there was an error during deletion.
 */
RQFile.deleteWorkFiles = function (filePath, tree, cb) {
  var deleteCreateFile = function () {
    tree.work.exists(filePath, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        tree.work.delete(filePath, cb);
      } else {
        cb();
      }
    });
  };
  var createFileName = tree.getCreateFileName(filePath);
  tree.work.exists(createFileName, function (err, createdExists) {
    if (err) {
      cb(err);
    } else if (createdExists) {
      tree.work.delete(createFileName, function (err) {
        if (err) {
          cb(err);
        } else {
          deleteCreateFile();
        }
      });
    } else {
      deleteCreateFile();
    }
  });
};

/**
 * Refeshes all work files for an RQ file by removing them and re-creating them.
 * @param {String} filePath normalized file path
 * @param {RQTree} tree tree object
 * @param {Function} cb Invoked when the refresh is complete.
 * @param {String|Exception} cb.err Will be truthy if there was an error during refresh.
 */
RQFile.refreshWorkFiles = function (filePath, tree, cb) {
  RQFile.deleteWorkFiles(filePath, tree, function (err) {
    if (err) {
      cb(err);
    } else {
      tree.work.createFile(filePath, function (err, file) {
        if (err) {
          cb(err);
        } else {
          cb();
        }
      });
    }
  });
};

/**
 * Sync factory method for initializing a new RQFile from a remote file.
 *
 * @param {String} filePath normalized file path
 * @param {RQTree} tree tree object
 * @param {DAMFile} remoteFile existing remote file to use
 */
RQFile.createInstanceFromRemote = function (filePath, tree, remoteFile) {
  return new RQFile(filePath, tree, remoteFile);
};

/**
 * Sync factory method for initializing a new RQFile from an existing local file.
 * @param {String} filePath normalized file path
 * @param {RQTree} tree tree object
 * @param {FSFile} localFile existing local file to use
 * @param {Function} cb Will be invoked after the instance is created.
 * @param {String|Exception} cb.err Will be truthy if there were errors while creating the instance.
 * @param {RQFile} cb.file The file instance that was created.
 */
RQFile.createInstanceFromLocal = function (filePath, tree, localFile, cb) {
  var rqFile = new RQFile(filePath, tree, null, localFile);
  rqFile.processCreatedFile(function (err, createdFile) {
    if (err) {
      cb(err);
    } else {
      cb(null, rqFile);
    }
  });
};

/**
 * Async factory method for initializing a new RQFile from an existing remote file and local file.
 * @param {String} filePath normalized file path
 * @param {RQTree} tree tree object
 * @param {FSFile} localFile existing local file to use
 * @param {DAMFile} remoteFile existing remote file to use
 * @param {Function} cb Will be invoked after the instance is created.
 * @param {String|Exception} cb.err Will be truthy if there were errors while creating the instance.
 * @param {RQFile} cb.file the file instance that was created
 */
RQFile.createInstanceFromLocalAndRemote = function (filePath, tree, localFile, remoteFile, cb) {
  var rqFile = new RQFile(filePath, tree, remoteFile, localFile);
  rqFile.processCreatedFile(function (err, createdFile) {
    if (err) {
      cb(err);
    } else {
      cb(null, rqFile);
    }
  });
};

/**
 * If needed, creates a "mirror" copy of the given file in the request queue's work directory. The file will be empty,
 * and the file's modified date will be used as the original file's creation date. Older versions of node don't support
 * an actual created date, so this is a workaround.
 * @param {Function} cb Will be invoked after the instance is created.
 * @param {String|Exception} cb.err Will be truthy if there were errors while processing the file.
 * @param {FSFile} cb.createdFile The instance of the creation date file.
 */
RQFile.prototype.processCreatedFile = function (cb) {
  var self = this;
  self.tree.processCreatedFile(self.getPath(), function (err, createdFile) {
    if (err) {
      cb(err);
    } else {
      self.createdFile = createdFile;
      cb(null, createdFile);
    }
  });
};

/**
 * Retrieves the a File instance that will be used internally.
 * @returns {File} A file instance for performing operations.
 */
RQFile.prototype.getFile = function() {
  if (!this.localFile) {
    return this.damFile;
  } else {
    return this.localFile;
  }
};

/**
 * If necessary, caches a remote file locally for use in cached operations.
 * @param {Function} cb callback called after caching is complete
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file File instance for consumption
 */
RQFile.prototype.cacheFile = function(cb) {
  var self = this;
  if (!self.localFile) {
    self.tree.share.fetchResource(self.filePath, function (err, localPath) {
      if (err) {
        cb(err);
      } else {
        logger.debug('successfully completed initial cache of %s to %s', self.filePath, localPath);
        self.local.createFileInstance(self.filePath, self.local, function (err, file) {
          if (err) {
            cb(err);
          } else {
            logger.debug('successfully created new instance of local file %s', localPath);
            self.processCreatedFile(function (err, createdFile) {
              if (err) {
                cb(err);
              } else {
                logger.debug('successfully created "creation date" file');
                self.localFile = file;
                cb(null, file);
              }
            });
          }
        });
      }
    });
  } else {
    // for files with both a local and remote version, check to see if the remote version needs to be re-cached
    if (self.damFile) {
      // find out if the local file can be safely deleted
      self.canDelete(function (err, canDelete) {
        if (err) {
          cb(err);
        } else {
          var remoteModified = self.damFile.lastModified();
          var localCreated = self.created();
          // check if the remote version has been modified since it was cached
          if (remoteModified > localCreated) {
            if (!canDelete) {
              // remote version has changed, but local version can't be safely deleted. check to see if it's queued
              self.tree.rq.exists(utils.getParentPath(self.getPath()), self.getName(), function (err, exists) {
                if (exists) {
                  logger.info('remote version of %s (modified %d) is newer than local file (created %d). local file was modified at %d but is in request queue. using cached file', self.filePath, remoteModified, localCreated, self.lastModified());
                  cb(null, self.localFile);
                } else {
                  logger.info('remote version of %s (modified %d) is newer than local file (created %d). local file was modified at %d, sending collision event', self.filePath, remoteModified, localCreated, self.lastModified());
                  self.tree.emitSyncConflict(self.filePath);
                  cb(null, self.localFile);
                }
              });
            } else {
              // remote version has changed, and local version can be safely deleted
              logger.info('remote verion of %s (modified %d) is newer than local file (created %d). updating cache.', self.filePath, remoteModified, localCreated);
              self.localFile.delete(function (err) {
                if (err) {
                  cb(err);
                } else {
                  self.createdFile.delete(function (err) {
                    if (err) {
                      cb(err);
                    } else {
                      self.localFile = null;
                      self.createdFile = null;
                      // re-cache remote file
                      self.cacheFile(cb);
                    }
                  });
                }
              });
            }
          } else {
            logger.debug('remote version of %s (modified %d) is still older than local file (created %d). using existing cache', self.filePath, remoteModified, localCreated);
            cb(null, self.localFile);
          }
        }
      });
    } else {
      // file doesn't have a remote counterpart, just return the local version
      logger.debug('file %s is local only, no remote version to cache', self.filePath);
      cb(null, self.localFile);
    }
  }
};

/**
 * Determines if the file can be safely deleted
 * @param {Function} cb Will be invoked once it's been determined if the file can be deleted.
 * @param {String|Exception} cb.err Will be truthy if there were errors.
 * @param {Bool} cb.canDelete Will be true if the file can be safely deleted, otherwise false.
 */
RQFile.prototype.canDelete = function (cb) {
  var self = this;
  self.tree.canDelete(self.getPath(), cb);
};

//---------------------------------------------------------------------< File >

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
RQFile.prototype.isFile = function () {
  return this.getFile().isFile();
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
RQFile.prototype.isDirectory = function () {
  return this.getFile().isDirectory();
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
RQFile.prototype.isReadOnly = function () {
  return this.getFile().isReadOnly();
};

/**
 * Return the file size.
 *
 * @return {Number} file size, in bytes
 */
RQFile.prototype.size = function () {
  return this.getFile().size();
};

/**
 * Return the number of bytes that are allocated to the file.
 *
 * @return {Number} allocation size, in bytes
 */
RQFile.prototype.allocationSize = function () {
  return this.getFile().allocationSize();
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last modification
 */
RQFile.prototype.lastModified = function () {
  return this.getFile().lastModified();
};

/**
 * Sets the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @param {Number} ms
 * @return {Number} time of last modification
 */
RQFile.prototype.setLastModified = function (ms) {
  this.getFile().setLastModified(ms);
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
RQFile.prototype.lastChanged = function () {
  return this.getFile().lastChanged();
};

/**
 * Return the create time, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
RQFile.prototype.created = function () {
  if (this.createdFile) {
    return this.createdFile.created();
  } else {
    return this.getFile().created();
  }
};

/**
 * Return the time of last access, in milliseconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
RQFile.prototype.lastAccessed = function () {
  return this.getFile().lastAccessed();
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
  this.getFile().close(function (err) {
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
