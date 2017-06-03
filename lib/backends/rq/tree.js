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
var unorm = require('unorm');
var async = require('async');

var File = require('../../spi/file');
var Tree = require('../../spi/tree');
var ntstatus = require('../../ntstatus');
var SMBError = require('../../smberror');
var utils = require('../../utils');
var FSShare = require('../fs/share');
var FSTree = require('../fs/tree');
var RQLocalTree = require('./localtree');
var RQFile = require('./file');
var RequestQueue = require('./requestqueue');
var RQProcessor = require('./rqprocessor');
var constants = require('./common');

var ignore_names = [
  /^\.metadata_never_index*/,
  /^\.aem$/,
  /^\.DS_Store/
];

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
  this.options = options;
  this.remote = remote;
  this.local = new RQLocalTree(share, new FSTree(new FSShare('rqlocal', share.config.local)), this);
  this.share = share;
  this.rq = new RequestQueue({
    path: share.config.work.path
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
    if (err instanceof SMBError) {
      rqlog.debug('[rq] encountered SMBError', err);
    } else {
      rqlog.error('[rq] error', err);
    }
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
 * Determines whether or not a given item has been queued for a set of methods.
 * @param {string} name The name of the item to check.
 * @param {Array} methods List of methods to check
 * @param {function} cb Will be invoked once the determination has been made.
 * @param {string|Error} cb.err Will be truthy if there were errors during the operation.
 * @param {string} cb.exists The matching method that is queued, or falsy if none are queued.
 */
RQTree.prototype.isQueuedFor = function (name, methods, cb) {
  var self = this;
  self.rq.getRequests(utils.getParentPath(name), function (err, lookup) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      var i;
      var queued = lookup[utils.getPathName(name)];
      var isQueued = false;
      if (queued) {
        for (i = 0; i < methods.length; i++) {
          if (queued == methods[i]) {
            isQueued = methods[i];
            break;
          }
        }
      }
      cb(null, isQueued);
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
            self.isQueuedFor(name, ['DELETE'], function (err, deleted) {
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

function _existsLocally(name, cb) {
  var self = this;
  self.local.exists(name, function (err, localExists) {
    if (err) {
      cb(err);
    } else {
      if (localExists) {
        self.local.isDownloading(name, function (err, isDownloading) {
          if (err) {
            cb(err);
          } else {
            cb(null, !isDownloading);
          }
        });
      } else {
        cb(null, false);
      }
    }
  });
}

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
  _existsLocally.call(this, name, function (err, localExists) {
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
        cb(new SMBError(ntstatus.STATUS_NO_SUCH_FILE, 'cannot open file because it does not exist ' + name));
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
 * Determines if a given file name should be excluded in list results.
 * @param {string} name The name of the file to test.
 * @returns {boolean} TRUE if the name should be ignored, FALSE otherwise.
 */
function _ignoreList(name) {
  for (var i = 0; i < ignore_names.length; i++) {
    if (name.match(ignore_names[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a data object that can be used by list operations.
 * @param {RQTree} tree The tree to provide in the data.
 * @param {string} pattern The pattern to provide in the data.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors.
 * @param {object} cb.data The data that was prepared by the method.
 * @private
 */
function _prepListData(tree, pattern, cb) {
  logger.debug('_prepListData: entering');
  var data = {
    pattern: pattern,
    tree: tree,
    parentPath: utils.getParentPath(pattern) || '',
    requests: {},
    rqFiles: [],
    lookup: {}
  };

  // add existing requests if local exists
  tree.rq.getRequests(tree.remoteEncodePath(data.parentPath), function (err, requests) {
    if (err) {
      cb(err);
    } else {
      tree.local.exists(data.parentPath, function (err, exists) {
        if (err) {
          cb(err);
        } else {
          data['localExists'] = exists;
          data['requests'] = requests;
          cb(null, data);
        }
      });
    }
  });
}

/**
 * Retrieves files from the remote source and converts them to RQFile instances.
 * @param {object} data Information to use while converting the files.
 * @param {string} data.pattern The pattern to use when listing the remote files.
 * @param {RQTree} data.tree Used to list the files and create RQFile instances.
 * @param {object} data.request A lookup of existing queued requests.
 * @param {array} data.rqFiles An array of RQFile instances that will be populated with remote files.
 * @param {object} data.lookup An object whose keys will be file paths, and values will be the index of the specified
 *   file in data.rqFiles.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the conversion.
 * @param {object} cb.data The original information passed to the method, along with any changes.
 */
function _convertRemoteToRqFile(data, cb) {
  logger.debug('_convertRemoteToRqFile: entering');
  var pattern = data.pattern;
  var tree = data.tree;
  var existingRequests = data.requests;

  rqlog.debug('RQTree.list.remote.list %s', pattern);
  tree.remote.list(pattern, function (err, remoteFiles) {
    if (err) {
      cb(err);
    } else {
      async.each(remoteFiles, function (remoteFile, eachCb) {
        if (tree.isTempFileName(remoteFile.getPath())) {
          // don't include remote temp files in lists
          eachCb();
        } else {
          if (existingRequests[tree.remoteEncodePath(remoteFile.getName())] != 'DELETE') {
            tree.createFileInstanceFromOpen(remoteFile, function (err, newFile) {
              if (err) {
                eachCb(err);
              } else {
                data.rqFiles.push(newFile);
                data.lookup[remoteFile.getName()] = data.rqFiles.length - 1;
                eachCb();
              }
            });
          } else {
            // file has been deleted locally, ignore
            eachCb();
          }
        }
      }, function (err) {
        if (err) {
          cb(err);
        } else {
          cb(null, data);
        }
      });
    }
  });
}

/**
 * Deletes a locally cached file, unless the file is in a state where it can't be deleted.
 * @param {RQTree} tree Will be used to delete the file.
 * @param {File} localFile The file to attempt to delete.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the delete.
 * @param {bool} cb.inConflict Will be truthy if the file was in conflict and could not be deleted.
 */
function _deleteLocalFile(tree, localFile, cb) {
  logger.debug('local file %s was not created locally, determining if it is safe to delete', localFile.getPath());

  // the file was not in the remote list of files, and it doesn't have a local creation
  // file indicating that it was created locally. Determine if it's safe to delete and
  // do so
  localFile.canDelete(function (err, canDelete) {
    if (err) {
      cb(err);
    } else if (canDelete) {
      logger.debug('local file %s can be safely deleted locally. deleting', localFile.getPath());
      // file can be safely deleted. remove it.
      if (localFile.isDirectory()) {
        tree.deleteLocalDirectoryRecursive(localFile.getPath(), function (err) {
          if (err) {
            cb(err);
          } else {
            logger.info('directory %s was deleted remotely. exclude from list', localFile.getPath());
            cb();
          }
        });
      } else {
        logger.info('file %s was deleted remotely. exclude from file list', localFile.getPath());
        tree.local.delete(localFile.getPath(), cb);
      }
    } else {
      // file can't be safely deleted
      cb(null, true);
    }
  });
}

/**
 * If a given local directory exists, this method will retrieve all files from the directory, convert them to
 * RQFiles and merge them with anything in data.rqFiles. Uses data.lookup to optimize the merge.
 * @param {object} data Information to use when performing the merge.
 * @param {RQTree} data.tree Will be used to retrieve files and create RQFile instances.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @param {object} cb.data The information that was passed to the method, along with any changes.
 */
function _mergeLocalFiles(data, cb) {
  logger.debug('_mergeLocalFiles: entering, localExists: %s', data.localExists);
  var tree = data.tree;
  var lookup = data.lookup;
  if (data.localExists) {
    tree.local.list(data.pattern, function (err, localFiles) {
      if (err) {
        cb(err);
      } else {
        async.each(localFiles, function (localFile, eachCb) {
          if (_ignoreList(localFile.getName())) {
            eachCb();
          } else if (tree.isTempFileName(localFile.getName())) {
            // it's a temporary file, just add it to the list
            tree.createFileInstanceFromOpen(localFile, function (err, rqFile) {
              if (err) {
                eachCb(err);
              } else {
                data.rqFiles.push(rqFile);
                eachCb();
              }
            });
          } else {
            var remoteIndex = lookup[localFile.getName()];
            if (remoteIndex !== undefined) {
              logger.debug('local file %s is present in both local and remote sources. using local info', localFile.getPath());
              tree.createFileInstanceFromOpen(localFile, function (err, rqFile) {
                if (err) {
                  eachCb(err);
                } else {
                  data.rqFiles[remoteIndex] = rqFile;
                  eachCb();
                }
              });
            } else {
              logger.debug('local file %s is only local, determining if it should be included', localFile.getPath());
              tree.createFileInstanceFromOpen(localFile, function (err, rqFile) {
                if (err) {
                  eachCb(err);
                } else {
                  logger.debug('checking to see if file %s was created locally', localFile.getPath());
                  tree.isCreatedLocally(localFile.getPath(), function (err, exists) {
                    if (err) {
                      eachCb(err);
                    } else {
                      if (exists) {
                        logger.debug('local file %s was created locally, including in results', localFile.getPath());
                        data.rqFiles.push(rqFile);
                        eachCb();
                      } else {
                        _deleteLocalFile(tree, localFile, function (err, isConflict) {
                          if (err) {
                            eachCb(err);
                          } else {
                            if (isConflict) {
                              logger.info('file %s is in conflict because it might need to be deleted. sending event', rqFile.getPath());
                              data.rqFiles.push(rqFile);
                              tree.emitSyncConflict(rqFile.getPath());
                            }
                            eachCb();
                          }
                        });
                      }
                    }
                  });
                }
              });
            }
          }
        }, function (err) {
          if (err) {
            cb(err);
          } else {
            cb(null, data);
          }
        });
      }
    });
  } else {
    cb(null, data);
  }
}

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
        async.waterfall([
          async.apply(_prepListData, self, pattern),
          _convertRemoteToRqFile,
          _mergeLocalFiles
        ], function (err, data) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            self.share.cacheList(dirPath, data.rqFiles);
            cb(null, data.rqFiles);
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
        var targetFile = files;
        if (files.length) {
          targetFile = files[0];
        }
        self.createFileInstanceFromOpen(targetFile, function (err, rqFile) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            if (files.length) {
              cb(null, [rqFile]);
            } else {
              cb(null, rqFile);
            }
          }
        });
      }
    };
    self.local.exists(pattern, function (err, exists) {
      if (err) {
        self.handleErr(cb, err);
      } else if (exists) {
        // local item exists, use local result
        self.local.list(pattern, function (err, files) {
          processRq(err, files);
        });
      } else if (!self.isTempFileName(pattern)) {
        self.isQueuedFor(pattern, ['DELETE'], function (err, deleted) {
          if (err) {
            self.handleErr(cb, err);
          } else if (!deleted) {
            // use remote result
            self.remote.list(pattern, function (err, files) {
              processRq(err, files);
            });
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
  self.remote.open(self.remoteEncodePath(filePath), function (err, remote) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      self.local.refreshCacheInfo(filePath, remote, function (err) {
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
 * Determines if a path can be safely deleted
 * @param {File|String} file The path or File instance to analyze.
 * @param {Function} cb Will be invoked once it's been determined if the path can be deleted.
 * @param {String|Error} cb.err Will be truthy if there were errors.
 * @param {Boolean} cb.canDelete Will be true if the path can be safely deleted, otherwise false.
 * @param {Number} cb.lastSynced If defined, will be the timestamp of the last sync time of the file.
 */
RQTree.prototype.canDelete = function (path, cb) {
  var self = this;
  rqlog.debug('RQTree.canDelete %s', path);
  logger.debug('%s received a path to check for deletion safety', path);
  // only need to check safety if the file is cached locally
  self.local.exists(path, function (err, exists) {
    if (err) {
      self.handleErr(cb, err);
    } else if (exists) {
      self.local.open(path, function (err, localFile) {
        if (err) {
          self.handleErr(cb, err);
        } else {
          localFile.canDelete(function (err, canDelete) {
            if (err) {
              self.handleErr(cb, err);
            } else {
              cb(null, canDelete);
            }
          });
        }
      });
    } else {
      logger.debug('%s has not been cached locally, so it can be deleted', path);
      cb(null, true);
    }
  });
};

function _processDirectory(tree, toProcess, cb) {
  var processDirs = [{
    name: toProcess
  }];
  var skipDelete = {};
  var index = 0;
  async.whilst(function () {
    return index >= 0;
  }, function (whilstCb) {
    var dirName = processDirs[index--].name;
    logger.debug('processing directory %s', dirName);
    tree.local.list(Path.join(dirName, '/*'), function (err, items) {
      if (err) {
        whilstCb(err);
      } else {
        logger.debug('found %d items in directory %s', items.length, dirName);

        async.eachSeries(items, function (item, eachCb) {
          if (item.isDirectory()) {
            logger.debug('%s is a directory, adding to dir queue', item.getPath());
            processDirs.splice(0, 0, {
              name: item.getPath(),
              parent: dirName
            });
            index++;
            eachCb();
          } else {
            _deleteFile(tree, item, function (err, wasDeleted) {
              if (err) {
                eachCb(err);
              } else {
                if (!wasDeleted) {
                  logger.debug('cannot delete file %s, skipping directory', item.getPath());
                  skipDelete[dirName] = true;
                }
                eachCb();
              }
            });
          }
        }, function (err) {
          whilstCb(err);
        });
      }
    });
  }, function (err) {
    if (err) {
      cb(err);
    } else {
      _deleteDirs(tree, processDirs, skipDelete, cb);
    }
  });
}

function _deleteDirs(tree, processDirs, skipDelete, cb) {
  logger.debug('_deleteDirs: entering with %d dirs', processDirs.length);
  async.eachSeries(processDirs, function (dir, eachCb) {
    var dirName = dir.name;
    if (skipDelete[dirName]) {
      logger.debug('skipping deletion of directory %s', dirName);
      if (dir.parent) {
        logger.debug('skipping parent directory %s', dir.parent);
        skipDelete[dir.parent] = true;
      }
      eachCb();
    } else {
      if (dirName != '/') {
        logger.debug('deleting directory %s', dirName);
        tree.local.deleteDirectory(dirName, eachCb);
      } else {
        logger.debug('not deleting root directory');
        eachCb();
      }
    }
  }, cb);
}

function _deleteFile(tree, toDelete, cb) {
  logger.debug('processing file %s', toDelete.getPath());

  logger.debug('deleting file %s', toDelete.getPath());
  toDelete.canDelete(function (err, canDelete) {
    if (err) {
      cb(err);
    } else if (canDelete) {
      logger.debug('deleting file %s', toDelete.getPath());
      tree.local.delete(toDelete.getPath(), function (err) {
        if (err) {
          cb(err);
        } else {
          cb(null, true);
        }
      });
    } else {
      // can't delete the file
      logger.debug('cannot delete file %s, emitting conflict event', toDelete.getPath());
      tree.emitSyncConflict(toDelete.getPath());
      cb(null, false);
    }
  });
}

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

  _processDirectory(self, name, function (err) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      cb();
    }
  });
};

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
 * Retrieves a value indicating whether a locally cached file was created locally.
 * @param {String} name normalized file path.
 * @param {Function} cb Will be invoked with result.
 * @param {String|Error} cb.err Will be truthy if there were problems retrieving the value.
 * @param {bool} cb.created Will be true if the file was created locally, otherwise false.
 */
RQTree.prototype.isCreatedLocally = function (name, cb) {
  rqlog.debug('RQTree.isCreatedLocally %s', name);
  var self = this;
  self.local.isCreatedLocally(name, function (err, isCreatedLocally) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      cb(null, isCreatedLocally);
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
RQTree.prototype.createFile = function (name, cb) {
  rqlog.debug('RQTree.createFile %s', name);
  logger.debug('[%s] tree.createFile %s', this.share.config.backend, name);
  var self = this;
  self.local.createFile(name, function (err, file) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      self.share.invalidateContentCache(utils.getParentPath(name), true);
      self.createFileInstanceFromOpen(file, cb);
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
  self.local.createDirectory(name, function (err, file) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      // create directory immediately
      self.share.invalidateContentCache(utils.getParentPath(name), true);
      if (!self.isTempFileName(name)) {
        self.remote.createDirectory(self.remoteEncodePath(name), function (err, remoteDir) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            self.createFileInstanceFromOpen(file, cb);
          }
        });
      } else {
        self.createFileInstanceFromOpen(file, cb);
      }
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
  self.local.getPathInfo(name, function (err, exists) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      self.share.invalidateContentCache(utils.getParentPath(name), true);
      if (exists) {
        self.isCreatedLocally(name, function (err, createExists) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            self.local.delete(name, function (err) {
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

  var deleteRemote = function (callback) {
    if (!self.isTempFileName(name)) {
      self.remote.deleteDirectory(self.remoteEncodePath(name), callback);
    } else {
      callback();
    }
  };

  self.local.exists(name, function (err, exists) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      self.share.invalidateContentCache(utils.getParentPath(name), true);
      if (exists) {
        self.local.deleteDirectory(name, function (err) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            deleteRemote(function (err) {
              if (err) {
                self.handleErr(cb, err);
              } else {
                self.rq.removePath(self.remoteEncodePath(name), function (err) {
                  if (err) {
                    self.handleErr(cb, err);
                  } else {
                    cb();
                  }
                });
              }
            });
          }
        });
      } else {
        deleteRemote(cb);
      }
    }
  });
};

/**
 * Retrieves information about the old name and new name, including whether the old or new path exist locally.
 *
 * @param {string} oldName The old path to check.
 * @param {string} newName The new path to check.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @param {object} Information about the pending rename.
 * @private
 */
function _getReplaceInfo(oldName, newName, cb) {
  var self = this;
  var info = {};

  function _isDirectory(callback) {
    self.local.getPathInfo(oldName, function (err, exists, isDir) {
      if (err) {
        cb(err);
      } else if (!exists) {
        var remoteOldName = self.remoteEncodePath(oldName);
        self.remote.exists(remoteOldName, function (err, existsRemote) {
          if (err) {
            cb(err);
          } else if (existsRemote) {
            self.remote.open(remoteOldName, function (err, file) {
              if (err) {
                cb(err);
              } else {
                info['oldExistsLocal'] = exists;
                info['oldExistsRemote'] = existsRemote;
                info['isDir'] = file.isDirectory();
                callback();
              }
            });
          } else {
            info['oldExistsLocal'] = exists;
            info['oldExistsRemote'] = existsRemote;
            info['isDir'] = false;
            callback();
          }
        });
      } else {
        info['oldExistsLocal'] = exists;
        info['isDir'] = isDir;
        callback();
      }
    });
  }

  function _getNewInfo(callback) {
    if (info.isDir) {
      callback();
    } else {
      self.isQueuedFor(newName, ['DELETE', 'POST'], function (err, queued) {
        if (err) {
          callback(err);
        } else {
          self.local.getPathInfo(newName, function (err, newExistsLocal) {
            if (err) {
              callback(err);
            } else {
              info['newExistsLocal'] = newExistsLocal;
              info['newQueued'] = queued;
              info['newExists'] = info.newExists || newExistsLocal;
              callback();
            }
          });
        }
      });
    }
  }

  function _getRemoteInfo(callback) {
    if (!self.isTempFileName(newName)) {
      var remotePath = self.remoteEncodePath(newName);
      self.remote.exists(remotePath, function (err, exists) {
        if (err) {
          callback(err);
        } else {
          info['newExists'] = exists;
          if (exists) {
            self.remote.open(remotePath, function (err, remoteFile) {
              if (err) {
                callback(err);
              } else {
                logger.debug('%s target of rename exists remotely, using remote file info', newName);
                info['newRemote'] = remoteFile;
                callback();
              }
            });
          } else {
            callback();
          }
        }
      });
    } else {
      callback();
    }
  }

  async.series([_isDirectory, _getRemoteInfo, _getNewInfo], function (err) {
    if (err) {
      cb(err);
    } else {
      cb(null, info);
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

  var renameRemoteDir = function (callback) {
    // due to the extreme complexity of attempting to rename between non-temp folder names and temp folder names,
    // anything involving a directory temp name will not be sent to the remote. for example, if renaming from a temp
    // directory to a non-temp directory, it would mean that ALL children of the directory would need to be uploaded
    // to the remote instance. inversely, renaming from a non-temp folder to a temp folder would mean that all children
    // of the directory would need to be downloaded to avoid losing data. there currently isn't a good solution for
    // this, so directories going through this process will become out of sync
    logger.debug('%s is a directory, preparing to rename remotely', oldName);
    if (!self.isTempFileName(oldName) && !self.isTempFileName(newName)) {
      self.remote.rename(self.remoteEncodePath(oldName), self.remoteEncodePath(newName), callback);
    } else {
      logger.debug('directory rename involves a temp directory, not sending to remote. %s -> %s', oldName, newName);
      callback();
    }
  };

  _getReplaceInfo.call(this, oldName, newName, function (err, info) {
    if (err) {
      self.handleErr(cb, err);
    } else {
      if (info.oldExistsLocal) {
        self.local.renameExt(oldName, newName, info.newRemote, function (err) {
          if (err) {
            self.handleErr(cb, err);
          } else {
            logger.debug('%s successfully renamed to %s', oldName, newName);
            // invalidate cache
            self.share.invalidateContentCache(utils.getParentPath(oldName), true);
            self.share.invalidateContentCache(utils.getParentPath(newName), true);

            if (info.isDir) {
              logger.debug('%s is a directory, preparing to rename remotely', oldName);
              renameRemoteDir(function (err) {
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
            } else {
              logger.debug('%s is a file, preparing to queue request', oldName);
              self.queueData(oldName, 'MOVE', newName, {replace: info.newExists}, function (err) {
                if (err) {
                  self.handleErr(cb, err);
                } else {
                  logger.debug('successfully queued MOVE for %s -> %s', oldName, newName);
                  self.handleErr(cb);
                }
              });
            }
          }
        });
      } else if (!self.isTempFileName(oldName)) {
        if (info.oldExistsRemote) {
          self.remote.rename(self.remoteEncodePath(oldName), self.remoteEncodePath(newName), cb);
        } else {
          cb();
        }
      } else {
        logger.warn('attempting to rename temp file %s, which does not exist', oldName);
        self.handleErr(cb, 'cannot rename non-existing temp file ' + oldName);
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
      if (remoteErr || localErr) {
        var err = [];
        if (remoteErr) {
          err.push(remoteErr);
        }
        if (localErr) {
          err.push(localErr);
        }
        cb(err);
      } else {
        cb();
      }
    });
  });
};

/**
 * Clears the tree's local cache.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {string|Error} cb.err Will be truthy if the operation fails.
 */
RQTree.prototype.clearCache = function (cb) {
  this.deleteLocalDirectoryRecursive(Path.sep, cb);
};

module.exports = RQTree;
