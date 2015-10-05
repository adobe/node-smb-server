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

var logger = require('winston');
var os = require('os');
var _ = require('lodash');

var consts = require('./constants');
var DefaultAuthenticator = require('./defaultAuthenticator');
var auth = require('./auth');
var SMBLogin = require('./smblogin');
var SMBSession = require('./smbsession');
var SMBShare = require('./smbshare');
var IPCShare = require('./ipcshare');

/**
 *
 * @param {Object} config - configuration hash
 * @param {Server} tcpServer - tcp server
 * @param {Authenticator} authenticator
 * @constructor
 */
function SMBServer(config, tcpServer, authenticator) {
  this.tcpServer = tcpServer;
  this.logins = {};
  this.sessions = {};
  this.shares = {};
  this.trees = {};
  this.domainName = config && config.domainName || '';
  this.nativeOS = os.type() + ' ' + os.release();
  this.nativeLanMan = consts.NATIVE_LANMAN;
  this.config = config && _.cloneDeep(config) || {};
  this.allowAnonymous = config.allowAnonymous;
  this.authenticator = authenticator || new DefaultAuthenticator(config);
  // init shares
  _.forEach(config.shares,
    function (shareCfg, name) {
      var type = shareCfg.backend;
      var Share = require('./backends/' + type + '/share');
      name = name.toUpperCase();  // share names are uppercase
      this.shares[name] = new SMBShare(this, new Share(name, shareCfg));
    },
    this
  );
  // add dummy IPC$ share
  this.shares['IPC$'] = new SMBShare(this, new IPCShare('IPC$'));
}

SMBServer.prototype.createLogin = function () {
  // todo figure out how an anonymous SMB login is supposed to work
  var challenge = this.allowAnonymous ? null : auth.createChallenge();
  var login = new SMBLogin(this, challenge);
  // register login
  this.logins[login.key] = login;
  return login;
};

SMBServer.prototype.getLogin = function (key) {
  return this.logins[key];
};

SMBServer.prototype.destroyLogin = function (key) {
  delete this.logins[key];
};

/**
 *
 * @param {SMBLogin} login
 * @param {String} accountName
 * @param {String} primaryDomain
 * @param {Buffer} caseInsensitivePassword
 * @param {Buffer} caseSensitivePassword
 * @param {Function} cb callback called with the authenticated session
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {SMBSession} cb.session authenticated session
 */
SMBServer.prototype.setupSession = function (login, accountName, primaryDomain, caseInsensitivePassword, caseSensitivePassword, cb) {
  var self = this;
  this.authenticator.authenticate(login.challenge, caseInsensitivePassword, caseSensitivePassword, primaryDomain, accountName, function (err, session) {
    if (err) {
      cb(err);
      return;
    }
    var smbSession = new SMBSession(self, accountName, primaryDomain, session);
    // register session
    self.sessions[smbSession.uid] = smbSession;
    cb(null, smbSession);
  });
};

SMBServer.prototype.getSession = function (uid) {
  return this.sessions[uid];
};

SMBServer.prototype.destroySession = function (uid) {
  delete this.sessions[uid];
};

SMBServer.prototype.getShareNames = function () {
  return _.keys(this.shares);
};

/**
 *
 * @param {SMBSession} session
 * @param {String} shareName
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {SMBSession} cb.session authenticated session
 */
SMBServer.prototype.connectTree = function (session, shareName, shareLevelPassword, cb) {
  var share = this.shares[shareName];
  if (!share) {
    process.nextTick(function () { cb(new Error('share not found')); });
    return;
  }
  var self = this;
  share.connect(session, shareLevelPassword, function (err, tree) {
    if (err) {
      cb(err);
    } else {
      // register tree
      self.trees[tree.tid] = tree;
      cb(null, tree);
    }
  });
};

SMBServer.prototype.getTree = function (tid) {
  return this.trees[tid];
};

SMBServer.prototype.disconnectTree = function (tid) {
  var tree = this.trees[tid];
  if (tree) {
    tree.disconnect();
    delete this.trees[tid];
  }
};

module.exports = SMBServer;

