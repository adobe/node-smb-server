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
var async = require('async');
var logger = require('winston');
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
  if (! (this instanceof JCRShare)) {
    return new JCRShare(name, config);
  }
  config = config || {};

  Share.call(this, name, config);

  this.host = config.host;
  this.port = config.port;
  this.auth = config.auth;
  this.path = config.path;
  // todo support token-based (et al) auth
  this.baseUrl = 'http://' + this.auth.username + ':' + this.auth.password
    + '@' + this.host + ':' + this.port
    + '/crx/server/crx.default/jcr%3aroot';

  this.type = consts.SHARE_TYPE_DISK;
  this.description = config.description || '';
};

// the JCRShare prototype inherits from Share
Util.inherits(JCRShare, Share);

/**
 *
 * @param {Session} session
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {IPCTree} cb.tree connected tree
 */
JCRShare.prototype.connect = function (session, shareLevelPassword, cb) {
  // todo check access rights of session?

  var urlObj = URL.parse(this.baseUrl);
  urlObj.pathname = Path.join(urlObj.pathname, this.path) + '.2.json';
  var url = URL.format(urlObj);

  var self = this;
  function getContent(done) {
    request({ url: url }, function (err, resp, body) {
      if (err) {
        done(err);
      } else if (resp.statusCode !== 200) {
        done(self.path + ': statusCode ' + resp.statusCode);
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

  function connectTempTree(content, tempDir, done) {
    var tmpShare = new FSShare('tmpFiles', {
      backend: 'fs',
      description: 'dummy share for local temp files',
      path: tempDir
    });

    tmpShare.connect(session, null, function (error, tmpTree) {
      done(error, content, tmpTree);
    });
  }

  function connectJCRTree(content, tempTree, done) {
    done(null, new JCRTree(self, content, tempTree));
  }

  async.waterfall([ getContent, createTempDir, connectTempTree, connectJCRTree ], function (err, tree) {
    if (err) {
      var msg = 'invalid share configuration: ' + self.config;
      logger.error(msg, err);
      cb(new SMBError(consts.STATUS_OBJECT_PATH_NOT_FOUND, msg));
    } else {
      cb(null, tree);
    }
  });
};

module.exports = JCRShare;

