/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2015 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 **************************************************************************/

'use strict';

var Util = require('util');
var Path = require('path');
var URL = require('url');

var request = require('request');
var _ = require('lodash');
var async = require('async');
var minimatch = require('minimatch');
var mkdirp = require('mkdirp');
var tmp = require('temp').track();

var Tree = require('../../spi/tree');
var JCRFile = require('./file');
var SMBError = require('../../smberror');
var consts = require('../../constants');
var utils = require('../../utils');
var JCR = require('./constants');

var TEMP_FILE_PATTERNS = [
  // OS X
  /^\._(.*)/,
  /^\.DS_Store/,
  /^\.metadata_never_index/,
  /^\.metadata_never_index_unless_rootfs/,
  /^\.ql_disablethumbnails/,
  /^\.ql_disablecache/,
  /^\.hidden/,
  /^\.Spotlight-V100/,
  /^\.TemporaryItems/,
  /^\.Trashes/,
  // Windows
  /^desktop\.ini/,
  /^Thumbs\.db/,
  /^~lock\.(.*)#/
];

function isTempFileName(name) {
  name = utils.getPathName(name);
  return TEMP_FILE_PATTERNS.some(function (pattern) {
    return pattern.test(name);
  });
}

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {JCRTree}
 * @param {JCRShare} share parent share
 * @param {Object} content JCR node representation
 * @param {Tree} tempFilesTree temporary files tree
 */
var JCRTree = function (share, content, tempFilesTree) {
  if (! (this instanceof JCRTree)) {
    return new JCRTree(share);
  }

  this.content = content;
  this.tsContent = Date.now();
  this.tempFilesTree = tempFilesTree;

  this.share = share;
  this.shareBaseUrl = share.baseUrl;
  this.sharePath = share.path;

  Tree.call(this);
};

// the JCRTree prototype inherits from Tree
Util.inherits(JCRTree, Tree);

JCRTree.prototype._getContentUrl = function (name, depth) {
  var urlObj = URL.parse(this.shareBaseUrl);
  urlObj.pathname = Path.join(urlObj.pathname, this.sharePath, name) + '.' + depth + '.json';
  return URL.format(urlObj);
};

JCRTree.prototype._getContent = function (name, depth, cb) {
  var url = this._getContentUrl(name, depth);
  var self = this;
  request({ url: url }, function (err, resp, body) {
    if (err) {
      cb(err);
    } else if (resp.statusCode === 200) {
      try {
        cb(null, JSON.parse(body));
      } catch (parseError) {
        cb(parseError);
      }
    } else if (resp.statusCode === 404) {
      cb(null, null);
    } else {
      cb(name + '[statusCode: ' + statusCode + ']');
    }
  });
};

JCRTree.prototype._getTreeContent = function (depth, cb) {
  var maxAge = this.share.config.cacheMaxAge || 0;
  if (maxAge < Date.now() - this.tsContent) {
    cb(null, this.content);
  }
  var url = this._getContentUrl('', depth);
  var self = this;
  request({ url: url }, function (err, resp, body) {
    if (err) {
      cb(err);
    } else if (resp.statusCode !== 200) {
      cb('statusCode: ' + resp.statusCode);
    } else {
      try {
        self.content = JSON.parse(body);
        self.tsContent = Date.now();
        cb(null, JSON.parse(body));
      } catch (parseError) {
        cb(parseError);
      }
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
JCRTree.prototype.exists = function (name, cb) {
  if (isTempFileName(name)) {
    this.tempFilesTree.exists(name, cb);
    return;
  }
  this._getContent(name, 0, function (err, content) {
    if (err) {
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else {
      cb(null, !!content);
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
  if (isTempFileName(name)) {
    this.tempFilesTree.open(name, cb);
    return;
  }
  var self = this;
  this._getContent(name, 1, function (err, content) {
    if (err) {
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else if (!content) {
      cb(new SMBError(consts.STATUS_NO_SUCH_FILE));
    } else {
      cb(null, new JCRFile(name, content, self));
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
JCRTree.prototype.list = function (pattern, cb) {
  var self = this;
  this.tempFilesTree.list(pattern, function (err, tmpFiles) {
    if (err) {
      if (err.status != consts.STATUS_NO_SUCH_FILE) {
        cb(err);
        return;
      }
    }
    // remove directory entries
    tmpFiles = tmpFiles.filter(function (f) { return f.isFile(); });

    // list entries and merge with tmpFiles

    var pos = pattern.lastIndexOf('/');
    var path = '';
    if (pos !== -1) {
      path = pattern.substring(0, pos);
      pattern = pattern.substring(pos + 1);
    }

    function getContent(done) {
      self._getContent(path, 2, function (err, content) {
        if (err) {
          done(err);
        } else {
          done(null, content);
        }
      });
    }

    function createEntries(content, done) {
      var entries = [];

      if (!content) {
        done(null, tmpFiles);
        return;
      }

      var types = [ JCR.NT_FILE, JCR.NT_FOLDER, JCR.SLING_ORDEREDFOLDER, JCR.DAM_ASSET ];
      _.forOwn(content, function(entry, nm) {
        if (minimatch(nm, pattern) && typeof entry === 'object' && entry[JCR.JCR_PRIMARYTYPE]) {
          if (types.indexOf(entry[JCR.JCR_PRIMARYTYPE]) > -1) {
            entries.push(new JCRFile(Path.join(path, nm), entry, self));
          }
        }
      });
      done(null, entries);
    }

    function mergeResults(files, done) {
      done(null, tmpFiles.concat(files));
    }

    async.waterfall([ getContent, createEntries, mergeResults ], function (err, result) {
      if (err) {
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
        return;
      }
      cb(null, result);
    });
  });
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.createFile = function (name, cb) {
  if (isTempFileName(name)) {
    // make sure parent path exists
    mkdirp.sync(Path.join(this.tempFilesTree.sharePath, utils.getParentPath(name)));
    this.tempFilesTree.createFile(name, cb);
    return;
  }
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.createDirectory = function (name, cb) {
  if (isTempFileName(name)) {
    this.tempFilesTree.createDirectory(name, cb);
    return;
  }
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Delete a file or directory. If name denotes a directory, it must be
 * empty in order to be deleted.
 *
 * @param {String} name file or directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.delete = function (name, cb) {
  if (isTempFileName(name)) {
    this.tempFilesTree.delete(name, cb);
    return;
  }
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
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
  if (isTempFileName(oldName) && isTempFileName(newName)) {
    this.tempFilesTree.rename(oldName, newName, cb);
    return;
  }

  if (isTempFileName(oldName) || isTempFileName(newName)) {
    // todo implement rename across trees
  }
  process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.disconnect = function (cb) {
  tmp.cleanup(function (ignored) {
    // todo cleanup cache etc
    cb();
  });
};

module.exports = JCRTree;
