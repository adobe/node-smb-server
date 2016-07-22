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

var RQLocalTree = require('./localtree');
var DAMTree = require('../dam/tree');
var RQFile = require('./file');
var Path = require('path');
var request = require('request');
var utils = require('../../utils');
var RequestQueue = require('./requestqueue')

/**
 * Creates an instance of RQTree.
 *
 * @constructor
 * @this {RQTree}
 * @param {RQShare} share parent share
 * @param {Object} content JCR node representation
 * @param {Tree} tempFilesTree temporary files tree
 */
var RQTree = function (share, content, tempFilesTree) {
  if (!(this instanceof RQTree)) {
    return new RQTree(share, content, tempFilesTree);
  }

  this.local = new RQLocalTree(share);
  this.share = share;
  this.rq = new RequestQueue({
    path: share.config.local.workpath
  });

  DAMTree.call(this, share, content, tempFilesTree);
};

// the RQTree prototype inherits from DAMTree
util.inherits(RQTree, DAMTree);

RQTree.prototype.getLocalPath = function (name) {
  return Path.join(this.share.config.local.path, name);
}

RQTree.prototype.getRemotePath = function (name) {
  return this.share.buildResourceUrl(name);
}

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
  this.local.exists(name, function (err, result) {
    if (err) {
      cb(err);
    }  else {
      if (result) {
        // if exists locally, return immediately
        cb(null, result);
      } else {
        // otherwise check to see if the file exists remotely
        DAMTree.prototype.exists.call(this, name, function (err, result) {
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
  this.local.exists(name, function (err, exists) {
    if (err) {
      cb(err);
    } else {
      if (!exists) {
        RQFile.createInstance(name, self, cb);
      } else {
        self.local.open(name, function (err, file) {
          if (err) {
            cb(err);
          } else {
            cb(null, RQFile.createInstanceFromLocal(name, self, file));
          }
        });
      }
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
RQTree.prototype.list = function (pattern, cb) {
  logger.debug('[%s] tree.list %s', this.share.config.backend, pattern);
  var self = this;
  DAMTree.prototype.list.call(self, pattern, function (err, remoteFiles) {
    if (err) {
      cb(err);
    } else {
      var parentPath = utils.getParentPath(pattern) || '';
      self.local.exists(parentPath, function (err, exists) {
        if (err) {
          cb(err);
        } else {
          if (exists) {
            self.local.list(pattern, function (err, localFiles) {
              if (err) {
                cb(err);
              } else {
                // TODO: merge local files with remote files
                var i;
                var lookup = {};
                for (i = 0; i < remoteFiles.length; i++) {
                  remoteFiles[i] = RQFile.createInstanceFromRemote(remoteFiles[i].getPath(), self, remoteFiles[i]);
                  lookup[remoteFiles[i].getName()] = i;
                }
                for (i = 0; i < localFiles.length; i++) {
                  var rqFile = RQFile.createInstanceFromLocal(localFiles[i].getPath(), self, localFiles[i]);;
                  if (lookup[localFiles[i].getName()] !== undefined) {
                    remoteFiles[i] = rqFile;
                  } else {
                    remoteFiles.push(rqFile);
                  }
                }
                cb(null, remoteFiles);
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
RQTree.prototype.queueData = function (name, method, newName) {
  var isTempFile = this.isTempFileName(name);
    var options = {
      method: method,
      localFile: this.getLocalPath(name),
      remoteFile: this.getRemotePath(name)
    };
    if (newName) {
      options['destLocalFile'] = this.getLocalPath(newName);
      options['destRemoteFile'] = this.getRemotePath(newName);
      isTempFile = isTempFile && this.isTempFileName(newName);
    }
  if (!isTempFile) {
    this.rq.queueRequest(options);
  }
};

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
  this.local.createFile(name, function (err, file) {
    if (err) {
      cb(err);
    } else {
      self.queueData(name, 'PUT');
      cb(null, RQFile.createInstanceFromLocal(name, self, file));
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
  // TODO: add to request queue
  this.local.createDirectory(name, cb);
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
   this.local.delete(name, function (err) {
     if (err) {
       cb(err);
     } else {
       self.queueData(name, 'DELETE');
       cb(null);
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
  // TODO: add to request queue
  this.local.deleteDirectory(name, cb);
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
  self.local.rename(oldName, newName, function (err) {
    if (err) {
      cb(err);
    } else {
      self.queueData(oldName, 'MOVE', newName);
      cb(null);
    }
  });
};

module.exports = RQTree;
