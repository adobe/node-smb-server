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

var Util = require('util');
var Path = require('path');
var stream = require('stream');

var logger = require('winston').loggers.get('spi');
var request = require('request');
var _ = require('lodash');
var async = require('async');
var mkdirp = require('mkdirp');
var tmp = require('temp').track();  // cleanup on exit

var Tree = require('../../spi/tree');
var JCRFile = require('./file');
var ntstatus = require('../../ntstatus');
var SMBError = require('../../smberror');
var utils = require('../../utils');

var TEMP_FILE_PATTERNS = [
  // misc
  /^~(.*)/,   // catch all files starting with ~
  /^\.(.*)/,  // catch all files starting with .
  /^TestFile/,  // InDesign: when a file is opened, InDesign creates .dat.nosync* file, renames it to TestFile and deletes it
  /\.tmp$/i, // Illustrator: on save, creates one or more *.tmp files, renames them to original file name
  /\.~tmp$/i, // some default Windows applications use this file format
  // OS X
  /\.sb-.{8}-.{6}$/,  // Preview: on save, creates a tmp folder and tmp file matching this pattern
/* (redundant included in preceding pattern)
  /^\.DS_Store/,
  /^\._(.*)/,
  /^\.metadata_never_index/,
  /^\.metadata_never_index_unless_rootfs/,
  /^\.com.apple.smb.streams.off/,
  /^\.ql_disablethumbnails/,
  /^\.ql_disablecache/,
  /^\.hidden/,
  /^\.Spotlight-V100/,
  /^\.apdisk/,
  /^\.TemporaryItems/,
  /^\.Trashes/,
*/
  /^DCIM/,
  // Windows
  /^desktop\.ini/i,
  /^Thumbs\.db/i,
/* (redundant included in preceding pattern)
  /^~lock\.(.*)#/
*/
];

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {JCRTree}
 * @param {JCRShare} share parent share
 * @param {Object} content JCR node representation
 * @param {Tree} [tempFilesTree] optional Tree implementation for handling temporary files;
 *                               if not specified temp files will be treated just like regular files
 */
var JCRTree = function (share, content, tempFilesTree) {
  if (!(this instanceof JCRTree)) {
    return new JCRTree(share, content, tempFilesTree);
  }

  this.content = content;
  this.tempFilesTree = tempFilesTree;

  this.share = share;

  Tree.call(this, this.share.config);
};

// the JCRTree prototype inherits from Tree
Util.inherits(JCRTree, Tree);

/**
 * Async factory method for creating a File instance
 *
 * @param {String} filePath normalized file path
 * @param {Object} [content=null] file meta data (null if unknown)
 * @param {Number} [fileLength=-1] file length (-1 if unknown)
 * @param {Function} cb callback called with result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file JCRFile instance
 */
JCRTree.prototype.createFileInstance = function (filePath, content, fileLength, cb) {
  content = typeof content === 'object' ? content : null;
  fileLength = typeof fileLength === 'number' ? fileLength : -1;
  cb = arguments[arguments.length - 1];
  if (typeof cb !== 'function') {
    logger.error(new Error('JCRTree.createFileInstance: called without callback'));
    cb = function () {};
  }
  JCRFile.createInstance(filePath, this, content, fileLength, cb);
};

/**
 * Parses content retrieved through {code}share.getContent(){code} and
 * creates the appropriate {code}File{code} instances.
 *
 * @param {Object} content
 * @param {String} path
 * @param {String} namePattern
 * @param {Function} cb callback called with result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Object} cb.files results object with filename/File instance pairs
 */
JCRTree.prototype.createFileInstancesFromContent = function (content, path, namePattern, cb) {
  var results = {};
  if (!content) {
    cb(null, {});
    return;
  }

  var self = this;
  var entries = {};
  this.share.parseContentChildEntries(content, function (childName, childContent) {

    if (namePattern === '*' || self.unicodeEquals(childName, namePattern)) {
      entries[Path.join(path, childName)] = childContent;
    }
  });

  // create JCRFile instances
  async.each(_.keys(entries),
    function (p, callback) {
      self.createFileInstance(p, entries[p], function (err, f) {
        if (err) {
          callback(err);
        } else {
          results[f.getName()] = f;
          callback();
        }
      });
    },
    function (err) {
      cb(err, results);
    }
  );
};

JCRTree.prototype.isTempFileName = function (name) {
  // short cuts
  if (name === Path.sep) {
    return false;
  }
  var names = name.charAt(0) === Path.sep ? name.substr(1).split(Path.sep) : name.split(Path.sep);
  return TEMP_FILE_PATTERNS.some(function (pattern) {
    return names.some(function (nm) {
      return pattern.test(nm);
    });
  });
};

JCRTree.prototype.fetchFileLength = function (path, cb) {
  var url = this.share.buildResourceUrl(path);
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'HEAD'
  });
  request(options, function (err, resp, body) {
    if (err) {
      cb(err);
    } else if (resp.statusCode !== 200) {
      cb(this.method + ' ' + this.href + ' [' + resp.statusCode + '] ' + body || '');
    } else {
      cb(null, resp.headers['content-length'] || 0);
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
JCRTree.prototype.exists = function (name, cb) {
  logger.debug('[%s] tree.exists %s', this.share.config.backend, name);
  if (this.tempFilesTree && this.isTempFileName(name)) {
    this.tempFilesTree.exists(name, cb);
    return;
  }

  if (name === Path.sep) {
    process.nextTick(function () { cb(null, true); });
    return;
  }

  // there is a bug in the assets api when doing a HEAD request for a folder that
  // doesn't exist. we end up in a redirect loop. instruct the request not to follow redirects and assume
  // that a redirect means that the url does not exist. in addition, use the content url instead of
  // the resource url due to sometimes receiving 302s even for folders that exist. using the content url
  // correctly returns a 200 for these folders
  var url = this.share.buildContentUrl(name);
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'HEAD',
    followRedirect: false
  });

  request(options, function (err, resp, body) {
    if (err) {
      // failed
      logger.error('failed to determine existence of %s', name, err);
      cb(SMBError.fromSystemError(err, 'unable to determin existence due to unexpected error ' + name));
    } else {
      cb(null, resp.statusCode === 200);
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
JCRTree.prototype.open = function (name, cb) {
  logger.debug('[%s] tree.open %s', this.share.config.backend, name);
  if (this.tempFilesTree && this.isTempFileName(name)) {
    this.tempFilesTree.open(name, cb);
    return;
  }
  this.createFileInstance(name, cb);
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
JCRTree.prototype.list = function (pattern, cb) {
  logger.debug('[%s] tree.list %s', this.share.config.backend, pattern);
  var fileName = utils.getPathName(pattern);
  var self = this;

  function listTempFiles(next) {
    if (self.tempFilesTree) {
      self.tempFilesTree.list(pattern, function (err, tmpFiles) {
        if (err) {
          next(err.status === ntstatus.STATUS_NO_SUCH_FILE ? null : err, []);
        } else {
          next(null, tmpFiles);
        }
      });
    } else {
      next(null, []);
    }
  }

  function listRemoteFiles(tmpFiles, next) {
    if (self.isTempFileName(pattern)) {
      // the requested files are in the local temp file tree, no need to merge with remote files
      next(null, tmpFiles);
      return;
    }
    var parentPath = utils.getParentPath(pattern) || '';

    // list content entries and merge with tmpFiles

    function getContent(done) {
      self.share.getContent(parentPath, true, done);
    }

    function createEntries(content, done) {
      self.createFileInstancesFromContent(content, parentPath, fileName, function (err, files) {
        if (err) {
          done(err);
        } else {
          // add tmp files to results object:
          // the results object is keyed by name in order to allow
          // overlaying tmp file results with remote results
          var results = {};
          _.forEach(tmpFiles, function (f) {
            results[f.getName()] = f;
          });
          results = _.merge(results, files);
          // convert result object to array of values
          done(null, _.values(results));
        }
      });
    }

    async.waterfall([ getContent, createEntries ], function (err, result) {
      if (err) {
        logger.error('failed to list files of %s', pattern, err);
        next(SMBError.fromSystemError(err, 'unable to list pattern due to unexpected error ' + pattern));
      } else {
        next(null, result);
      }
    });
  }

  if (fileName === '*') {
    // wildcard pattern: list entries of parent path
    async.waterfall([ listTempFiles, listRemoteFiles ], cb);
  } else {
    // qualified path
    if (this.isTempFileName(pattern)) {
      if (this.tempFilesTree) {
        this.tempFilesTree.list(pattern, cb);
      } else {
        cb(null, []);
      }
    } else {
      this.createFileInstance(pattern, function (err, file) {
        cb(err, [ file ]);
      })
    }
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
JCRTree.prototype.createFile = function (name, cb) {
  logger.debug('[%s] tree.createFile %s', this.share.config.backend, name);
  if (this.tempFilesTree && this.isTempFileName(name)) {
    // make sure parent path exists
    mkdirp.sync(Path.join(this.tempFilesTree.share.path, utils.getParentPath(name)));
    this.tempFilesTree.createFile(name, cb);
    return;
  }

  var self = this;
  var url = this.share.buildResourceUrl(name);
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'PUT',
    headers: {
      'Content-Type': utils.lookupMimeType(name)
    }
  });

  var emptyStream = new stream.PassThrough();
  emptyStream.end(new Buffer(0));
  emptyStream.pipe(
    request(options, function (err, resp, body) {
      if (err) {
        logger.error('failed to create %s', name, err);
        cb(SMBError.fromSystemError(err, 'unable to create file due to unexpected error ' + name));
      } else if (resp.statusCode === 409) {
        cb(new SMBError(ntstatus.STATUS_OBJECT_NAME_COLLISION, 'unable to create file due to 409 status code ' + name));
      } else if (resp.statusCode !== 201) {
        logger.error('failed to create %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
        cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, 'unable to create file due to ' + resp.statusCode + ' status code ' + name));
      } else {
        // succeeded
        // invalidate cache
        self.share.invalidateContentCache(utils.getParentPath(name), true);
        // create JCRFile instance
        self.createFileInstance(name, null, 0, cb);
      }
    })
  );
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created directory
 */
JCRTree.prototype.createDirectory = function (name, cb) {
  logger.debug('[%s] tree.createDirectory %s', this.share.config.backend, name);
  if (this.tempFilesTree && this.isTempFileName(name)) {
    // make sure parent path exists
    mkdirp.sync(Path.join(this.tempFilesTree.share.path, utils.getParentPath(name)));
    this.tempFilesTree.createDirectory(name, cb);
    return;
  }

  var self = this;
  var url = this.share.buildResourceUrl(name);
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'MKCOL'
  });

  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to create %s', name, err);
      cb(SMBError.fromSystemError(err, 'unable to create directory due to unexpected error ' + name));
    } else if (resp.statusCode === 409) {
      cb(new SMBError(ntstatus.STATUS_OBJECT_NAME_COLLISION, 'unable to create directory due to 409 status code ' + name));
    } else if (resp.statusCode !== 201) {
      logger.error('failed to create %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, 'unable to create directory due to ' + resp.statusCode + ' status code ' + name));
    } else {
      // succeeded
      // invalidate cache
      self.share.invalidateContentCache(utils.getParentPath(name), true);
      // create JCRFile instance
      self.createFileInstance(name, null, 0, cb);
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
JCRTree.prototype.delete = function (name, cb) {
  logger.debug('[%s] tree.delete %s', this.share.config.backend, name);
  if (this.tempFilesTree && this.isTempFileName(name)) {
    this.tempFilesTree.delete(name, cb);
    return;
  }

  var url = this.share.buildResourceUrl(name);
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'DELETE'
  });

  var self = this;
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to delete %s', name, err);
      cb(SMBError.fromSystemError(err, 'unable to delete file due to unexpected error ' + name));
    } else if (resp.statusCode === 404) {
      cb(new SMBError(ntstatus.STATUS_NO_SUCH_FILE, 'unable to delete file because it does not exist ' + name));
    } else if (resp.statusCode !== 204) {
      logger.error('failed to delete %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, 'unable to delete file due to ' + resp.statusCode + ' status code ' + name));
    } else {
      // succeeded
      // invalidate cache
      self.share.invalidateContentCache(name, false);
      cb();
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
JCRTree.prototype.deleteDirectory = function (name, cb) {
  logger.debug('[%s] tree.deleteDirectory %s', this.share.config.backend, name);
  if (this.tempFilesTree && this.isTempFileName(name)) {
    this.tempFilesTree.deleteDirectory(name, cb);
    return;
  }

  var url = this.share.buildResourceUrl(name);
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'DELETE'
  });

  var self = this;
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to delete %s', name, err);
      cb(SMBError.fromSystemError(err, 'unable to delete directory due to unexpected error ' + name));
    } else if (resp.statusCode === 404) {
      cb(new SMBError(ntstatus.STATUS_NO_SUCH_FILE, 'unable to delete directory because it does not exist ' + name));
    } else if (resp.statusCode !== 204) {
      logger.error('failed to delete %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, 'unable to delete directory due to ' + resp.statusCode + ' status code ' + name));
    } else {
      // succeeded
      // invalidate cache
      self.share.invalidateContentCache(name, true);
      if (self.tempFilesTree) {
        // now cleanup tmp files shadow directory
        self.tempFilesTree.deleteDirectory(name, function (ignored) {
          cb();
        });
      } else {
        cb();
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
JCRTree.prototype.rename = function (oldName, newName, cb) {
  logger.debug('[%s] tree.rename %s to %s', this.share.config.backend, oldName, newName);
  if (this.tempFilesTree && this.isTempFileName(oldName) && this.isTempFileName(newName)) {
    this.tempFilesTree.rename(oldName, newName, cb);
    return;
  }

  var self = this;
  if (this.isTempFileName(oldName) || this.isTempFileName(newName)) {
    // rename across trees
    var srcTree = this.isTempFileName(oldName) ? this.tempFilesTree : this;
    var destTree = this.isTempFileName(newName) ? this.tempFilesTree : this;

    srcTree.open(oldName, function (err, srcFile) {
      if (err) {
        cb(err);
        return;
      }
      srcFile.moveTo(destTree, newName, function (err) {
        srcFile.close(function (ignored) {
          if (!err) {
            // invalidate cache
            self.share.invalidateContentCache(utils.getParentPath(oldName), true);
            self.share.invalidateContentCache(utils.getParentPath(newName), true);
          }
          cb(err);
        });
      });
    });
    return;
  }

  var url = this.share.buildResourceUrl(oldName);
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'MOVE',
    headers: {
      'Destination': this.share.path + encodeURI(newName),
      'Depth': 'infinity',
      'Overwrite': 'F'
    }
  });
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to move %s to %s', oldName, newName, err);
      cb(SMBError.fromSystemError(err, 'unable to rename due to unexpected error ' + oldName + ' > ' + newName));
    } else if (resp.statusCode !== 201) {
      logger.error('failed to move %s to %s - %s %s [%d]', oldName, newName, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL, 'unable to rename due to ' + resp.statusCode + ' status code ' + oldName + ' > ' + newName));
    } else {
      // succeeded
      // invalidate cache
      self.share.invalidateContentCache(utils.getParentPath(oldName), true);
      self.share.invalidateContentCache(utils.getParentPath(newName), true);
      cb();
    }
  });
};

/**
 * Refresh a specific folder.
 *
 * @param {String} folderPath
 * @param {Boolean} deep
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.refresh = function (folderPath, deep, cb) {
  logger.debug('[%s] tree.refresh %s, %d', this.share.config.backend, folderPath, deep);

  // invalidate cache
  this.share.invalidateContentCache(utils.getParentPath(folderPath), deep);

  cb();
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.disconnect = function (cb) {
  logger.debug('[%s] tree.disconnect', this.share.config.backend);
  var self = this;
  tmp.cleanup(function (ignored) {
    // let share do its cleanup tasks
    self.share.disconnect(cb);
  });
};

module.exports = JCRTree;
