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
var mime = require('mime');
var mkdirp = require('mkdirp');

var JCRTree = require('../jcr/tree');
var DAMFile = require('./file');
var SMBError = require('../../smberror');
var ntstatus = require('../../ntstatus');
var utils = require('../../utils');
var DAM = require('./constants');

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {DAMTree}
 * @param {DAMShare} share parent share
 * @param {Object} content JCR node representation
 * @param {Tree} tempFilesTree temporary files tree
 */
var DAMTree = function (share, content, tempFilesTree) {
  if (!(this instanceof DAMTree)) {
    return new DAMTree(share, content, tempFilesTree);
  }

  JCRTree.call(this, share, content, tempFilesTree);
};

// the DAMTree prototype inherits from JCRTree
Util.inherits(DAMTree, JCRTree);

//---------------------------------------------------------------< JCRTree >

/**
 * Async factory method for creating a File instance
 *
 * @param {String} filePath normalized file path
 * @param {Object} [content=null] file meta data (null if unknown)
 * @param {Number} [fileLength=-1] file length (-1 if unknown)
 * @param {Function} cb callback called with the bytes actually read
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file DAMFile instance
 */
DAMTree.prototype.createFileInstance = function (filePath, content, fileLength, cb) {
  content = typeof content === 'object' ? content : null;
  fileLength = typeof fileLength === 'number' ? fileLength : -1;
  cb = arguments[arguments.length - 1];
  if (typeof cb !== 'function') {
    logger.error(new Error('DAMTree.createFileInstance: called without callback'));
    cb = function () {};
  }
  DAMFile.createInstance(filePath, this, content, fileLength, cb);
};

DAMTree.prototype.isTempFileName = function (name) {
  // call base class method
  return JCRTree.prototype.isTempFileName.call(this, name);
};

DAMTree.prototype.fetchFileLength = function (path, cb) {
  // call base class method
  return JCRTree.prototype.fetchFileLength.call(this, path, cb);
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
DAMTree.prototype.exists = function (name, cb) {
  // call base class method
  // todo use assets api
  return JCRTree.prototype.exists.call(this, name, cb);
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
DAMTree.prototype.open = function (name, cb) {
  // call base class method
  return JCRTree.prototype.open.call(this, name, cb);
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
DAMTree.prototype.list = function (pattern, cb) {
  // call base class method
  return JCRTree.prototype.list.call(this, pattern, cb);
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
DAMTree.prototype.createFile = function (name, cb) {
  logger.debug('[%s] tree.createFile %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    // make sure parent path exists
    mkdirp.sync(Path.join(this.tempFilesTree.share.path, utils.getParentPath(name)));
    this.tempFilesTree.createFile(name, cb);
    return;
  }

  var self = this;
  var url = 'http://' + this.share.host + ':' + this.share.port + DAM.ASSETS_API_PATH + utils.stripParentPath(this.share.path, DAM.DAM_ROOT_PATH) + name;
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'POST',
    headers: {
      'Content-Type': mime.lookup(name)
    }
  });

  var emptyStream = new stream.PassThrough();
  emptyStream.end(new Buffer(0));
  emptyStream.pipe(
    request(options, function (err, resp, body) {
      if (err) {
        logger.error('failed to create %s', name, err);
        cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
      } else if (resp.statusCode === 409) {
        cb(new SMBError(ntstatus.STATUS_OBJECT_NAME_COLLISION));
      } else if (resp.statusCode !== 201) {
        logger.error('failed to create %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
        cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
      } else {
        // succeeded
        // invalidate cache
        self.share.invalidateCache(utils.getParentPath(name), true);
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
DAMTree.prototype.createDirectory = function (name, cb) {
  logger.debug('[%s] tree.createDirectory %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    // make sure parent path exists
    mkdirp.sync(Path.join(this.tempFilesTree.share.path, utils.getParentPath(name)));
    this.tempFilesTree.createDirectory(name, cb);
    return;
  }

  var self = this;
  var parentPath = utils.getParentPath(name) || '';
  var pathName = utils.getPathName(name);
  var url = 'http://' + this.share.host + ':' + this.share.port + DAM.ASSETS_API_PATH + utils.stripParentPath(this.share.path, DAM.DAM_ROOT_PATH) + parentPath + '/*';
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'POST',
    form: {
      name: pathName
    }
  });
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to create %s', name, err);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else if (resp.statusCode === 409) {
      cb(new SMBError(ntstatus.STATUS_OBJECT_NAME_COLLISION));
    } else if (resp.statusCode !== 201) {
      logger.error('failed to create %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else {
      // succeeded
      // invalidate cache
      self.share.invalidateCache(utils.getParentPath(name), true);
      // create DAMFile instance
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
DAMTree.prototype.delete = function (name, cb) {
  logger.debug('[%s] tree.delete %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    this.tempFilesTree.delete(name, cb);
    return;
  }

  var url = 'http://' + this.share.host + ':' + this.share.port + DAM.ASSETS_API_PATH + utils.stripParentPath(this.share.path, DAM.DAM_ROOT_PATH) + name;
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'DELETE'
  });

  var self = this;
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to delete %s', name, err);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else if (resp.statusCode === 404) {
      cb(new SMBError(ntstatus.STATUS_NO_SUCH_FILE));
    } else if (resp.statusCode !== 200) {
      logger.error('failed to delete %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else {
      // succeeded
      // invalidate cache
      self.share.invalidateCache(name, false);
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
DAMTree.prototype.deleteDirectory = function (name, cb) {
  logger.debug('[%s] tree.deleteDirectory %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    this.tempFilesTree.deleteDirectory(name, cb);
    return;
  }

  var url = 'http://' + this.share.host + ':' + this.share.port + DAM.ASSETS_API_PATH + utils.stripParentPath(this.share.path, DAM.DAM_ROOT_PATH) + name;
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'DELETE'
  });

  var self = this;
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to delete %s', name, err);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else if (resp.statusCode === 404) {
      cb(new SMBError(ntstatus.STATUS_NO_SUCH_FILE));
    } else if (resp.statusCode !== 200) {
      logger.error('failed to delete %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else {
      // succeeded
      // invalidate cache
      self.share.invalidateCache(name, true);
      // now cleanup tmp files shadow directory
      self.tempFilesTree.deleteDirectory(name, function (ignored) {
        cb();
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
DAMTree.prototype.rename = function (oldName, newName, cb) {
  logger.debug('[%s] tree.rename %s to %s', this.share.config.backend, oldName, newName);
  if (this.isTempFileName(oldName) && this.isTempFileName(newName)) {
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
        srcFile.close(function (ignore) {
          if (!err) {
            // invalidate cache
            self.share.invalidateCache(utils.getParentPath(oldName), true);
            self.share.invalidateCache(utils.getParentPath(newName), true);
          }
          cb(err);
        });
      });
    });
    return;
  }

  var url = 'http://' + this.share.host + ':' + this.share.port + DAM.ASSETS_API_PATH + utils.stripParentPath(this.share.path, DAM.DAM_ROOT_PATH) + oldName;
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'MOVE',
    headers: {
      'X-Destination': DAM.ASSETS_API_PATH + utils.stripParentPath(this.share.path, DAM.DAM_ROOT_PATH) + encodeURI(newName),
      'X-Depth': 'infinity',
      'X-Overwrite': 'F'
    }
  });
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to move %s to %s', oldName, newName, err);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else if (resp.statusCode !== 201) {
      logger.error('failed to move %s to %s - %s %s [%d]', oldName, newName, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(ntstatus.STATUS_UNSUCCESSFUL));
    } else {
      // succeeded
      // invalidate cache
      self.share.invalidateCache(utils.getParentPath(oldName), true);
      self.share.invalidateCache(utils.getParentPath(newName), true);
      cb();
    }
  });
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.disconnect = function (cb) {
  // call base class method
  return JCRTree.prototype.disconnect.call(this, cb);
};

module.exports = DAMTree;
