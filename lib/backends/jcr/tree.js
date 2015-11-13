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
var stream = require('stream');

var logger = require('winston').loggers.get('spi');
var request = require('request');
var mime = require('mime');
var _ = require('lodash');
var async = require('async');
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
  /^\.(.*)/,    // catch all files starting with .
/*
  /^\.DS_Store/,
  /^\.metadata_never_index/,
  /^\.metadata_never_index_unless_rootfs/,
  /^\.ql_disablethumbnails/,
  /^\.ql_disablecache/,
  /^\.hidden/,
  /^\.Spotlight-V100/,
  /^\.TemporaryItems/,
  /^\.Trashes/,
*/
  /^DCIM/,
  // Windows
  /^desktop\.ini/,
  /^Thumbs\.db/,
  /^~lock\.(.*)#/
];

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
    return new JCRTree(share, content, tempFilesTree);
  }

  this.content = content;
  this.tempFilesTree = tempFilesTree;

  this.share = share;

  Tree.call(this);
};

// the JCRTree prototype inherits from Tree
Util.inherits(JCRTree, Tree);

JCRTree.prototype.createFileInstance = function (filePath, content, fileLength) {
  return new JCRFile(filePath, content, fileLength, this);
};

JCRTree.prototype.isTempFileName = function (name) {
  // short cuts
  if (name === '/') {
    return false;
  }
  var names = name.charAt(0) === '/' ? name.substr(1).split('/') : name.substr(1).split('/');
  return TEMP_FILE_PATTERNS.some(function (pattern) {
    return names.some(function (nm) {
      return pattern.test(nm);
    });
  });
};

JCRTree.prototype.isFilePrimaryType = function (primaryType) {
  return [ JCR.NT_FILE ].indexOf(primaryType) > -1;
};

JCRTree.prototype.isDirectoryPrimaryType = function (primaryType) {
  return [ JCR.NT_FOLDER, JCR.SLING_FOLDER, JCR.SLING_ORDEREDFOLDER ].indexOf(primaryType) > -1;
};

JCRTree.prototype.fetchContent = function (name, depth, cb) {
  if (name === '/') {
    name = '';
  }
  var url = 'http://' + this.share.host + ':' + this.share.port + this.share.jsonServletPath + this.share.path + name + '.' + depth + '.json';
  var options = {
    url: url,
    auth: this.share.auth
  };
  request(options, function (err, resp, body) {
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
      cb(this.method + ' ' + this.href + ' [' + resp.statusCode + '] ' + body || '');
    }
  });
};

JCRTree.prototype.fetchFileLength = function (path, cb) {
  var url = 'http://' + this.share.host + ':' + this.share.port + this.share.path + path;
  var options = {
    url: url,
    method: 'HEAD',
    auth: this.share.auth
  };
  request(options, function (err, resp, body) {
    if (err) {
      cb(err);
    } else if (resp.statusCode !== 200) {
      cb(this.method + ' ' + this.href + ' [' + resp.statusCode + '] ' + body || '');
    } else {
      cb(null, resp.headers['content-length']);
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
  logger.debug('[%s] exists %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    this.tempFilesTree.exists(name, cb);
    return;
  }
  // todo use HEAD request?
  this.fetchContent(name, 0, function (err, content) {
    if (err) {
      logger.error('failed to determine existence of %s', name, err);
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
  logger.debug('[%s] open %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    this.tempFilesTree.open(name, cb);
    return;
  }
  var self = this;
  this.fetchContent(name, 1, function (err, content) {
    if (err) {
      logger.error('failed to fetch content of %s', name, err);
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else if (!content) {
      cb(new SMBError(consts.STATUS_NO_SUCH_FILE));
    } else {
      if (self.isFilePrimaryType(content[JCR.JCR_PRIMARYTYPE])) {
        // fetch file length
        self.fetchFileLength(name, function (err, length) {
          if (err) {
            logger.error('failed to fetch file length for %s', name, err);
            cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
          } else {
            cb(null, self.createFileInstance(name, content, length));
          }
        });
      } else {
        cb(null, self.createFileInstance(name, content, 0));
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
JCRTree.prototype.list = function (pattern, cb) {
  logger.debug('[%s] list %s', this.share.config.backend, pattern);
  var origPattern = pattern;
  var self = this;
  var results = {};
  this.tempFilesTree.list(pattern, function (err, tmpFiles) {
    if (err) {
      if (err.status != consts.STATUS_NO_SUCH_FILE) {
        cb(err);
        return;
      }
      tmpFiles = [];
    }

    if (self.isTempFileName(pattern)) {
      // we're done
      cb(null, tmpFiles);
      return;
    }

    // add tmp files to results object:
    // the results object is keyed by name in order to allow
    // overlaying tmp file results with jcr results
    _.forEach(tmpFiles, function (f) {
      results[f.getName()] = f;
    });

    var path = utils.getParentPath(pattern) || '';
    pattern = utils.getPathName(pattern);

    // list content entries and merge with tmpFiles

    function getContent(done) {
      self.fetchContent(path, 2, function (err, content) {
        if (err) {
          done(err);
        } else {
          done(null, content);
        }
      });
    }

    function createEntries(content, done) {
      if (!content) {
        done(null, []);
        return;
      }

      var files = {};
      var directories = {};
      // filter matching files & directories
      _.forOwn(content, function(entry, nm) {
        if ((pattern === '*' || nm === pattern) && typeof entry === 'object' && entry[JCR.JCR_PRIMARYTYPE]) {
          if (self.isDirectoryPrimaryType(entry[JCR.JCR_PRIMARYTYPE])) {
            directories[Path.join(path, nm)] = entry;
          } else if (self.isFilePrimaryType(entry[JCR.JCR_PRIMARYTYPE])) {
            files[Path.join(path, nm)] = entry;
          }
        }
      });

      // create JCRFile instances
      _.forOwn(directories, function(entry, name) {
        var dir = self.createFileInstance(name, entry, 0);
        results[dir.getName()] = dir;
      });
      // need to fetch length for files
      async.each(_.keys(files),
        function (p, callback) {
          // fetch length
          self.fetchFileLength(p, function (err, length) {
            if (err) {
              callback(err);
            } else {
              var f = self.createFileInstance(p, files[p], length);
              results[f.getName()] = f;
              callback();
            }
          });
        },
        function (err) {
          done(err, results);
        }
      );
    }

    async.waterfall([ getContent, createEntries ], function (err, result) {
      if (err) {
        logger.error('failed to list files of %s', origPattern, err);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
        return;
      }
      // convert result object to array of values
      cb(null, _.values(result));
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
  logger.debug('[%s] createFile %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    // make sure parent path exists
    mkdirp.sync(Path.join(this.tempFilesTree.share.path, utils.getParentPath(name)));
    this.tempFilesTree.createFile(name, cb);
    return;
  }

  if (this.share.path === '/content/dam') {
    // todo fixme: need to use asset specific api here: should rather create 'dam' backend which extends 'jcr' backend
    var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + name;
    var options = {
      url: url,
      method: 'POST',
      headers: {
        'Content-Type': mime.lookup(name)
      },
      auth: this.share.auth
    };

    var emptyStream = new stream.PassThrough();
    emptyStream.end(new Buffer(0));
    emptyStream.pipe(
      request(options, function (err, resp, body) {
        if (err) {
          logger.error('failed to create %s', name, err);
          cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
        } else if (resp.statusCode !== 201) {
          logger.error('failed to create %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
          cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
        } else {
          // succeeded
          cb();
        }
      })
    );
  } else {
    // todo use sling/davex api
    process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
  }
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.createDirectory = function (name, cb) {
  logger.debug('[%s] createDirectory %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    // make sure parent path exists
    mkdirp.sync(Path.join(this.tempFilesTree.share.path, utils.getParentPath(name)));
    this.tempFilesTree.createDirectory(name, cb);
    return;
  }

  var parentPath = utils.getParentPath(name) || '';
  var pathName = utils.getPathName(name);
  if (this.share.path === '/content/dam') {
    // todo fixme: need to use asset specific api here: should rather create 'dam' backend which extends 'jcr' backend
    var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + parentPath + '/*';
    var options = {
      url: url,
      method: 'POST',
      form: {
        name: pathName
      },
      auth: this.share.auth
    };
    request(options, function (err, resp, body) {
      if (err) {
        logger.error('failed to create %s', name, err);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else if (resp.statusCode !== 201) {
        logger.error('failed to create %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else {
        // succeeded
        cb();
      }
    });
  } else {
    // todo use sling/davex api
    process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
  }
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.delete = function (name, cb) {
  logger.debug('[%s] delete %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    this.tempFilesTree.delete(name, cb);
    return;
  }

  if (this.share.path === '/content/dam') {
    // todo fixme: need to use asset specific api here: should rather create 'dam' backend which extends 'jcr' backend
    var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + name;
    var options = {
      url: url,
      method: 'DELETE',
      auth: this.share.auth
    };
    request(options, function (err, resp, body) {
      if (err) {
        logger.error('failed to delete %s', name, err);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else if (resp.statusCode !== 200) {
        logger.error('failed to delete %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else {
        // succeeded
        cb();
      }
    });
  } else {
    // todo use sling/davex api
    process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
  }
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.deleteDirectory = function (name, cb) {
  logger.debug('[%s] deleteDirectory %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    this.tempFilesTree.deleteDirectory(name, cb);
    return;
  }

  if (this.share.path === '/content/dam') {
    // todo fixme: need to use asset specific api here: should rather create 'dam' backend which extends 'jcr' backend
    var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + name;
    var options = {
      url: url,
      method: 'DELETE',
      auth: this.share.auth
    };
    request(options, function (err, resp, body) {
      if (err) {
        logger.error('failed to delete %s', name, err);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else if (resp.statusCode !== 200) {
        logger.error('failed to delete %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else {
        // succeeded
        cb();
      }
    });
  } else {
    // todo use sling/davex api
    process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
  }
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
  logger.debug('[%s] rename %s to %s', this.share.config.backend, oldName, newName);
  if (this.isTempFileName(oldName) && this.isTempFileName(newName)) {
    this.tempFilesTree.rename(oldName, newName, cb);
    return;
  }

  if (this.isTempFileName(oldName) || this.isTempFileName(newName)) {
    // todo implement rename across trees
    logger.error('cross-backend move %s to %s is not yet supported', oldName, newName);
    process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
    return;
  }

  if (this.share.path === '/content/dam') {
    // todo fixme: need to use asset specific api here: should rather create 'dam' backend which extends 'jcr' backend
    var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + oldName;
    var options = {
      url: url,
      method: 'MOVE',
      headers: {
        'X-Destination': '/api/assets' + newName,
        'X-Depth': 'infinity',
        'X-Overwrite': 'F'
      },
      auth: this.share.auth
    };
    request(options, function (err, resp, body) {
      if (err) {
        logger.error('failed to move %s to %s', oldName, newName, err);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else if (resp.statusCode !== 201) {
        logger.error('failed to move %s to %s - %s %s [%d]', oldName, newName, this.method, this.href, resp.statusCode, body);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else {
        // succeeded
        cb();
      }
    });
  } else {
    // todo use sling/davex api
    process.nextTick(function () { cb(new SMBError(consts.STATUS_NOT_IMPLEMENTED)); });
  }
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
JCRTree.prototype.disconnect = function (cb) {
  logger.debug('[%s] disconnect', this.share.config.backend);
  tmp.cleanup(function (ignored) {
    // todo cleanup cache etc
    cb();
  });
};

/**
 * Return the absolute path of a file within a tree.
 *
 * @param {String} name file name
 * @return {String} absolute path
 */
JCRTree.prototype.getPath = function (name) {
  return Path.join(this.share.path, name);
};


module.exports = JCRTree;
