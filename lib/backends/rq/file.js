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
  DAMFile.createInstance(filePath, tree, null, -1, function (err, damFile) {
    if (err) {
      cb(err);
    } else {
      cb(null, RQFile.createInstanceFromRemote(filePath, tree, damFile));
    }
  });
};

/**
 * Deletes an RQ file by ensuring all associated files are also removed.
 * @param {String} filePath normalized file path
 * @param {RQTree} tree tree object
 * @param {Function} cb Invoked when the deletion is complete.
 * @param {String|Exception} cb.err Will be truthy if there was an error during deletion.
 */
RQFile.deleteFile = function (filePath, tree, cb) {
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
  rqFile.processCreatedFile(filePath, function (err, createdFile) {
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
  rqFile.processCreatedFile(filePath, function (err, createdFile) {
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
 * @param {String} filePath normalized file path
 * @param {Function} cb Will be invoked after the instance is created.
 * @param {String|Exception} cb.err Will be truthy if there were errors while processing the file.
 * @param {FSFile} cb.createdFile The instance of the creation date file.
 */
RQFile.prototype.processCreatedFile = function (filePath, cb) {
  var self = this;
  if (self.isFile()) {
    self.work.exists(filePath, function (err, exists) {
      if (err) {
        cb(err);
      } else if (exists) {
        FSFile.createInstance(filePath, self.work, function (err, createdFile) {
          if (err) {
            cb(err);
          } else {
            self.createdFile = createdFile;
            cb(null, createdFile);
          }
        });
      } else {
        self.work.createFile(filePath, function (err, createdFile) {
          if (err) {
            cb(err);
          } else {
            self.createdFile = createdFile;
            cb(null, createdFile);
          }
        });
      }
    });
  } else {
    cb();
  }
}

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
        FSFile.createInstance(self.filePath, self.local, function (err, file) {
          if (err) {
            cb(err);
          } else {
            logger.debug('successfully created new instance of local file %s', localPath);
            self.processCreatedFile(self.filePath, function (err, createdFile) {
              if (err) {
                cb(err);
              } else {
                logger.debug('successfully created "creation date" file');
                cb(null, file);
              }
            });
          }
        });
      }
    });
  } else {
    self.processCreatedFile(self.filePath, function (err, createdFile) {
      if (err) {
        cb(err);
      } else {
        // check to see if the remote version has been modified
        if (createdFile && self.damFile) {
          var remoteTime = self.damFile.lastModified();
          var localCreatedTime = createdFile.created();
          var localModified = self.localFile.lastModified();
          var modifiedDiff = localModified - localCreatedTime;
          if (remoteTime > localCreatedTime) {
            if (modifiedDiff > self.tree.share.config.modifiedThreshold) {
              logger.info('remote version of %s (modified %d) is newer than local file (created %d). local file was modified at %d, sending collision event', self.filePath, remoteTime, localCreatedTime, localModified);
              cb(null, self.localFile);
            } else {
              logger.info('remote verion of %s (modified %d) is newer than local file (created %d). updating cache.', self.filePath, remoteTime, localCreatedTime);
              // file was modified remotely, remove and re-cache
              self.localFile.delete(function (err) {
                if (err) {
                  cb(err);
                } else {
                  createdFile.delete(function (err) {
                    if (err) {
                      cb(err);
                    } else {
                      self.localFile = null;
                      self.createdFile = null;
                      self.cacheFile(cb);
                    }
                  });
                }
              });
            }
          } else {
            cb(null, self.localFile);
          }
        } else {
          cb(null, self.localFile);
        }
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
  this.cacheFile(function (err, file) {
    if (err) {
      cb(err);
    } else {
      file.delete(function (err){
        if (err) {
          cb(err);
        } else {
          self.dirty = false;
          self.tree.queueData(file.getPath(), 'DELETE');
          RQFile.deleteFile(self.filePath, self.tree, function (err) {
            if (err) {
              logger.error('unexpected error while trying to cleanup RQ file after delete', err);
            }
            cb(null);
          });
        }
      });
    }
  });
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
    cb(err);
    if (self.dirty) {
      if (self.tree.createdFiles[self.getPath()]) {
        self.tree.createdFiles[self.getPath()] = false;
        self.tree.queueData(self.getPath(), 'PUT');
      } else {
        self.tree.queueData(self.getPath(), 'POST');
      }
    }
  });
};

module.exports = RQFile;
