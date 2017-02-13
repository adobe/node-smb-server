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

var fs = require('fs');
var Path = require('path');
var Util = require('util');

var _ = require('lodash');
var request = require('request');
var async = require('async');
var logger = require('winston').loggers.get('spi');
var tmp = require('temp').track();  // cleanup on exit

var Share = require('../../spi/share');
var FSShare = require('../fs/share');
var JCRTree = require('./tree');
var JCR = require('./constants');
var utils = require('../../utils');
var ntstatus = require('../../ntstatus');
var SMBError = require('../../smberror');
var mkdirp = require('mkdirp');

/**
 * Creates an instance of JCRShare.
 *
 * @constructor
 * @this {JCRShare}
 * @param {String} name share name
 * @param {Object} config configuration hash
 */
var JCRShare = function (name, config) {
  if (!(this instanceof JCRShare)) {
    return new JCRShare(name, config);
  }
  config = config || {};

  Share.call(this, name, config);

  this.host = config.host;
  this.port = config.port || 80;
  this.auth = config.auth;
  this.path = config.path;
  this.protocol = config.protocol || 'http:';
  this.maxSockets = config.maxSockets || 32;

  // path prefix for .<depth>.json requests
  //this.jsonServletPath = ''; // Sling Default Get Servlet
  this.jsonServletPath = '/crx/server/crx.default/jcr%3aroot'; // DAVEX

  this.description = config.description || '';

  // TTL in ms for content cache entries
  this.contentCacheTTL = typeof config.contentCacheTTL === 'number' ? config.contentCacheTTL : 30000; // default: 30s
  // TTL in ms for cached binaries
  this.binCacheTTL = typeof config.binCacheTTL === 'number' ? config.binCacheTTL : 300000; // default: 5m
  this.cachedFolderListings = {};
  this.cachedFileEntries = {};
  this.cachedBinaries = {};
  var self = this;
  this.purgeCacheTimer = setInterval(function () {
    var now = Date.now();
    function iterate(content, path, cache) {
      if (now - content.fetched > self.contentCacheTTL) {
        delete cache[path];
      }
    }
    _.forOwn(self.cachedFileEntries, iterate);
    _.forOwn(self.cachedFolderListings, iterate);
  }, this.contentCacheTTL);
};

// the JCRShare prototype inherits from Share
Util.inherits(JCRShare, Share);

JCRShare.prototype.isFilePrimaryType = function (primaryType) {
  return [ JCR.NT_FILE ].indexOf(primaryType) > -1;
};

JCRShare.prototype.isDirectoryPrimaryType = function (primaryType) {
  return [ JCR.NT_FOLDER, JCR.SLING_FOLDER, JCR.SLING_ORDEREDFOLDER ].indexOf(primaryType) > -1;
};

JCRShare.prototype.parseContentChildEntries = function (content, iterator) {
  var self = this;
  _.forOwn(content, function(entry, nm) {
    if (typeof entry === 'object' && entry[JCR.JCR_PRIMARYTYPE]
      && (self.isFilePrimaryType(entry[JCR.JCR_PRIMARYTYPE])
      || self.isDirectoryPrimaryType(entry[JCR.JCR_PRIMARYTYPE]))) {
      iterator(nm, entry);
    }
  });
};

JCRShare.prototype.buildContentUrl = function (path, depth) {
  return this.protocol + '//' + this.host + ':' + this.port + this.jsonServletPath + encodeURI(utils.normalizeSMBFileName(Path.join(this.path, path))) + '.' + depth + '.json';
};

JCRShare.prototype.buildResourceUrl = function (path) {
  return this.protocol + '//' + this.host + ':' + this.port + encodeURI(utils.normalizeSMBFileName(Path.join(this.path, path)));
};

JCRShare.prototype.getContent = function (path, deep, cb) {
  // check cache
  var cache = deep ? this.cachedFolderListings : this.cachedFileEntries;
  var result = cache[path];
  if (result) {
    if (Date.now() - result.fetched <= this.contentCacheTTL) {
      //logger.debug('returning cached content %s', path);
      cb(null, result);
      return;
    } else {
      delete cache[path];
    }
  }

  var self = this;
  logger.debug('fetching content %s, deep=%s', path, deep);
  this.fetchContent(path, deep, function (err, content) {
    if (err) {
      cb(err);
      return;
    }
    if (content) {
      // cached root never expires
      content.fetched = path === Path.sep && !deep ? Number.MAX_SAFE_INTEGER : Date.now();
      cache[path] = content;
      //logger.debug('cached content %s', path);
      if (deep) {
        // populate self.cachedFileEntries with child entries
        self.parseContentChildEntries(content, function (childName, childContent) {
          childContent.fetched = Date.now();
          var childPath = Path.join(path, childName);
          self.cachedFileEntries[childPath] = childContent;
          //logger.debug('cached content %s', childPath);
        });
      }
    } else {
      // content not found: invalidate stale cache entries
      self.invalidateContentCache(path, deep);
    }
    cb(null, content);
  });
};

JCRShare.prototype.invalidateContentCache = function (path, deep) {
  if (this.cachedFileEntries[path]) {
    // file/directory entry
    //logger.debug('invalidating cached entry %s', path);
    delete this.cachedFileEntries[path];
    // invalidate parent folder listing as well
    var parentPath = utils.getParentPath(path);
    //logger.debug('invalidating cached directory listing %s', parentPath);
    delete this.cachedFolderListings[parentPath];
  }
  if (this.cachedFolderListings[path]) {
    // directory listing
    //logger.debug('invalidating cached directory listing %s', path);
    delete this.cachedFolderListings[path];
    // make sure child entries get invalidated as well
    deep = true;
  }

  var pathPrefix = path + Path.sep;

  function iterate(content, p, cache) {
    if (p.indexOf(pathPrefix) === 0) {
      //logger.debug('invalidating cached content %s', path);
      delete cache[p];
    }
  }

  if (deep) {
    _.forOwn(this.cachedFileEntries, iterate);
    _.forOwn(this.cachedFolderListings, iterate);
  }
};

JCRShare.prototype.fetchContent = function (path, deep, cb) {
  if (path === Path.sep) {
    path = '';
  }
  var depth = deep ? 2 : 1;
  var url = this.buildContentUrl(path, depth);
  var opts = this.applyRequestDefaults(null, url);
  request(opts, function (err, resp, body) {
    if (err) {
      cb(err);
    } else if (resp.statusCode === 200) {
      // succeeded
      try {
        cb(null, JSON.parse(body));
      } catch (parseError) {
        cb(parseError);
      }
    } else if (resp.statusCode === 404) {
      // not found, return null
      cb(null, null);
    } else {
      // failed
      cb(this.method + ' ' + this.href + ' [' + resp.statusCode + '] ' + body || '');
    }
  });
};

/**
 * Returns the path of local file holding a copy of the remote resource's content.
 *
 * @param {String} path path of remote resource
 * @param {Number} lastModified remote resource's last modification time stamp (used to detect stale cache entries)
 * @param {Function} cb callback called with the path of the local file holding a copy of the remote resource's content.
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {String} cb.localFilePath path of local file holding a copy of the remote resource's content.
 */
JCRShare.prototype.getLocalFile = function (path, lastModified, cb) {
  var self = this;
  function checkCache(path, callback) {
    var result = self.cachedBinaries[path];
    if (result) {
      if (Date.now() - result.fetched <= self.binCacheTTL && lastModified <= result.lastModified) {
        // valid cache entry, verify
        fs.stat(result.localFilePath, function (err, stats) {
          if (err) {
            logger.warn('detected corrupt cache entry %s: local copy %s cannot be found', path, result.localFilePath, err);
            delete self.cachedBinaries[path];
            result = null;
          }
          callback(null, result);
        });
        return;
      } else {
        // evict expired cache entry
        delete self.cachedBinaries[path];
        fs.unlink(result.localFilePath, function (ignored) {});
        result = null;
        // fall through
      }
    }
    callback(null, result);
  }

  function cacheResource(path, callback) {
    logger.debug('fetching resource %s', path);
    self.fetchResource(path, function (err, localFilePath) {
      if (err) {
        cb(err);
        return;
      }
      // create cache entry
      if (localFilePath) {
        self.cachedBinaries[path] = {
          localFilePath: localFilePath,
          lastModified: lastModified,
          fetched: Date.now()
        };
        //logger.debug('cached resource %s', path);
      }
      callback(null, localFilePath);
    });
  }

  // check cache
  checkCache(path, function (err, result) {
    if (err) {
      cb(err);
    } else if (result) {
      // found valid cache entry. we're done
      cb(null, result.localFilePath);
    } else {
      // fetch resource and cache it
      cacheResource(path, cb);
    }
  });
};

/**
 * Touches the cache entry of a remote resource, i.e. extends the entry's TTL and updates the lastModified timestamp.
 * The cached local file itself won't be touched or modified.
 *
 * @param {String} path path of remote resource
 * @param {Number} lastModified remote resource's last modification time stamp (used to detect stale cache entries)
 * @param {Function} cb callback called with the path of the local file holding a copy of the remote resource's content.
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
JCRShare.prototype.touchLocalFile = function (path, lastModified, cb) {
  var result = this.cachedBinaries[path];
  if (result) {
    fs.stat(result.localFilePath, function (err, stats) {
      if (!err) {
        result.lastModified = lastModified;
        result.fetched = Date.now();
        cb();
      } else {
        logger.warn('detected corrupt cache entry %s: local copy %s cannot be found', err);
        delete self.cachedBinaries[path];
        cb(err);
      }
    });
  }
};

/**
 * Removes the cache entry and discards the local file holding a copy of the remote resource's content.
 *
 * @param {String} path path of remote resource
 * @param {Function} cb callback called on completion
 * @param {String|Error} cb.error error (non-null if an error occurred)
 */
JCRShare.prototype.discardLocalFile = function (path, cb) {
  var result = this.cachedBinaries[path];
  if (result) {
    delete this.cachedBinaries[path];
    fs.unlink(result.localFilePath, cb);
  } else {
    cb();
  }
};

/**
 * Fetches the specified remote resource and returns the path of the local file holding a copy of the remote resource's content.
 *
 * @param {String} path path of remote resource
 * @param {Function} cb callback called with the path of the local file holding a copy of the remote resource's content.
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {String} cb.localFilePath path of local file holding a copy of the remote resource's content.
 */
JCRShare.prototype.fetchResource = function (path, cb) {
  // spool remote resource to local tmp file
  var stream = this.createResourceStream(path);
  var tmpFilePath = stream.path;

  var self = this;

  var failed = false;
  stream.on('finish', function () {
    if (failed) {
      fs.unlink(tmpFilePath, function (ignored) {
        cb('failed to spool ' + path + ' to ' + tmpFilePath);
      });
    } else {
      fs.stat(tmpFilePath, function (err, stats) {
        if (err) {
          cb(err);
        } else {
          logger.debug('[%s] spooled %s to %s (%d bytes)', self.config.backend, path, tmpFilePath, stats.size);
          cb(null, tmpFilePath);
        }
      });
    }
  });

  var url = this.buildResourceUrl(path);
  var options = this.applyRequestDefaults(null, url);
  request(options)
    .on('response', function (resp) {
      if (resp.statusCode !== 200) {
        logger.error('failed to spool %s to %s - %s %s [%d]', path, tmpFilePath, this.method, this.href, resp.statusCode);
        failed = true;
      }
    })
    .on('error', function (err) {
      fs.unlink(tmpFilePath, function (ignored) {
        cb(err);
      });
    })
    .pipe(stream);
};

JCRShare.prototype.createResourceStream = function (path) {
  return tmp.createWriteStream({
    suffix: '-' + utils.getPathName(path)
  });
};

JCRShare.prototype.createTreeInstance = function (content, tempFilesTree) {
  return new JCRTree(this, content, tempFilesTree);
};

JCRShare.prototype.applyRequestDefaults = function (opts, url) {
  var def = {};
  if (url) {
    def.url = url;
  }
  if (this.auth) {
    def.auth = this.auth;
  }
  // limit/throttle # of concurrent backend requests
  def.pool = { maxSockets: this.maxSockets };
  def.strictSSL = false;
  return _.defaultsDeep(def, opts, this.config.options);
};

//--------------------------------------------------------------------< Share >

/**
 * Return a flag indicating whether this is a named pipe share.
 *
 * @return {Boolean} <code>true</code> if this is a named pipe share;
 *         <code>false</code> otherwise, i.e. if it is a disk share.
 */
JCRShare.prototype.isNamedPipe = function () {
  return false;
};

/**
 *
 * @param {Session} session
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {JCRTree} cb.tree connected tree
 */
JCRShare.prototype.connect = function (session, shareLevelPassword, cb) {

  var self = this;
  function getContent(done) {
    self.getContent(Path.sep, false, done);
  }

  function createTempDir(content, done) {
    if (!content) {
      done('not found');
      return;
    }
    if (!self.config.tmpPath) {
        tmp.mkdir('NodeSMBServerTmpFiles_', function (err, dirPath) {
            if (!err) {
                logger.debug('created local tmp directory for temporary system files: %s', dirPath);
            }
            done(err, content, dirPath);
        });
    } else {
      mkdirp(self.config.tmpPath, function (err) {
        if (!err) {
          logger.debug('created local tmp directory for temporary system files: %s', self.config.tmpPath);
        }
        done(err, content, self.config.tmpPath);
      });
    }
  }

  function prepopulateTempDir(content, tempDir, done) {
    fs.closeSync(fs.openSync(Path.join(tempDir, '.metadata_never_index'), 'w'));
    fs.closeSync(fs.openSync(Path.join(tempDir, '.metadata_never_index_unless_rootfs'), 'w'));
    //fs.closeSync(fs.openSync(Path.join(tempDir, '.com.apple.smb.streams.off'), 'w'));
    done(null, content, tempDir);
  }

  function connectTempTree(content, tempDir, done) {
    var tmpShare = new FSShare('tmpFiles', {
      backend: 'fs',
      description: 'shadow share for local temporary system files',
      path: tempDir
    });

    tmpShare.connect(session, null, function (error, tmpTree) {
      done(error, content, tmpTree);
    });
  }

  function connectJCRTree(content, tempTree, done) {
    done(null, self.createTreeInstance(content, tempTree));
  }

  async.waterfall([ getContent, createTempDir, prepopulateTempDir, connectTempTree, connectJCRTree ], function (err, tree) {
    if (err) {
      var msg = 'invalid share configuration: ' + JSON.stringify({ host: self.config.host, port: self.config.port, path: self.config.path });
      logger.error(msg, err);
      cb(new SMBError(ntstatus.STATUS_OBJECT_PATH_NOT_FOUND, msg));
    } else {
      cb(null, tree);
    }
  });
};

JCRShare.prototype.disconnect = function (cb) {
  clearInterval(this.purgeCacheTimer);
  tmp.cleanup(cb);
};

module.exports = JCRShare;

