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
var SMBError = require('../../smberror');
var consts = require('../../constants');

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
  this.port = config.port;
  this.auth = config.auth;
  this.path = config.path;

  // path prefix for .<depth>.json requests
  //this.jsonServletPath = ''; // Sling Default Get Servlet
  this.jsonServletPath = '/crx/server/crx.default/jcr%3aroot'; // DAVEX

  this.type = consts.SHARE_TYPE_DISK;
  this.description = config.description || '';
};

// the JCRShare prototype inherits from Share
Util.inherits(JCRShare, Share);

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
 *
 * @param {Session} session
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {JCRTree} cb.tree connected tree
 */
JCRShare.prototype.connect = function (session, shareLevelPassword, cb) {
  // todo check access rights of session?

  var url = 'http://' + this.host + ':' + this.port + this.jsonServletPath + this.path + '.1.json';
  var self = this;
  function getContent(done) {
    var opts = self.applyRequestDefaults(null, url);
    request(opts, function (err, resp, body) {
      if (err) {
        done(err);
      } else if (resp.statusCode !== 200) {
        done(this.method + ' ' + this.href + ' [' + resp.statusCode + '] ' + body || '');
      } else {
        try {
          done(null, JSON.parse(body));
        } catch (parseError) {
          done(parseError);
        }
      }
    });
  }

  function createTempDir(content, done) {
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
      cb(new SMBError(consts.STATUS_OBJECT_PATH_NOT_FOUND, msg));
    } else {
      cb(null, tree);
    }
  });
};

module.exports = JCRShare;

