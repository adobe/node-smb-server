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

  // path prefix for .<depth>.json requests
  //this.jsonServletPath = ''; // Sling Default Get Servlet
  this.jsonServletPath = '/crx/server/crx.default/jcr%3aroot'; // DAVEX

  this.description = config.description || '';

  // TTL in ms for content cache entries
  this.cacheTTL = typeof config.cacheTTL === 'number' ? config.cacheTTL : 5000;
  this.cachedFolderListings = {};
  this.cachedFileEntries = {};
  var self = this;
  this.purgeCacheTimer = setInterval(function () {
    var now = Date.now();
    function iterate(content, path, cache) {
      if (now - content.fetched > self.cacheTTL) {
        delete cache[path];
      }
    }
    _.forOwn(self.cachedFileEntries, iterate);
    _.forOwn(self.cachedFolderListings, iterate);
  }, this.cacheTTL);
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

JCRShare.prototype.getContent = function (path, deep, cb) {
  // check cache
  var cache = deep ? this.cachedFolderListings : this.cachedFileEntries;
  var result = cache[path];
  if (result) {
    if (Date.now() - result.fetched <= this.cacheTTL) {
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
    // cached root never expires
    content.fetched = path === '/' && !deep ? Number.MAX_SAFE_INTEGER : Date.now();
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
    cb(null, content);
  });
};

JCRShare.prototype.invalidateCache = function (path, deep) {
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

  var pathPrefix = path + '/';

  function iterate(content, p, cache) {
    if (p.indexOf(pathPrefix) === 0) {
      //logger.debug('invalidating cached %s', path);
      delete cache[p];
    }
  }

  if (deep) {
    _.forOwn(this.cachedFileEntries, iterate);
    _.forOwn(this.cachedFolderListings, iterate);
  }
};

JCRShare.prototype.fetchContent = function (path, deep, cb) {
  if (path === '/') {
    path = '';
  }
  var depth = deep ? 2 : 1;
  var url = 'http://' + this.host + ':' + this.port + this.jsonServletPath + this.path + path + '.' + depth + '.json';
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

JCRShare.prototype.createTreeInstance = function (content, tempFilesTree) {
  return new JCRTree(this, content, tempFilesTree);
};

JCRShare.prototype.applyRequestDefaults = function(opts, url) {
  var def = {};
  if (url) {
    def.url = url;
  }
  if (this.auth) {
    def.auth = this.auth;
  }
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
    self.getContent('/', false, done);
  }

  function createTempDir(content, done) {
    if (!content) {
      done('not found');
      return;
    }
    tmp.mkdir('AdobeCATmpFiles_', function (err, dirPath) {
      if (!err) {
        logger.debug('created local tmp directory for temporary system files: %s', dirPath);
      }
      done(err, content, dirPath);
    });
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
  cb();
};

module.exports = JCRShare;

