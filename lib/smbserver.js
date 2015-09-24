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

/**
 *
 * @param {Object} config - configuration hash
 * @param {Server} tcpServer - tcp server
 * @param (Authenti
 * @constructor
 */
function SMBServer(config, tcpServer, authenticator) {
  this.tcpServer = tcpServer;
  this.logins = {};
  this.sessions = {};
  this.domainName = config && config.domainName || '';
  this.nativeOS = os.type() + ' ' + os.release();
  this.nativeLanMan = consts.NATIVE_LANMAN;
  this.config = config && _.cloneDeep(config) || {};
  this.allowAnonymous = config.allowAnonymous;
  this.authenticator = authenticator || new DefaultAuthenticator(config);
}

SMBServer.prototype.createLogin = function () {
  // todo figure out how an anonymous SMB login is supposed to work
  var challenge = this.allowAnonymous ? null : auth.createChallenge();
  var login = new SMBLogin(this, challenge);
  this.logins[login.key] = login;
  return login;
};

SMBServer.prototype.getLogin = function (key) {
  return this.logins[key];
};

SMBServer.prototype.destroyLogin = function (key) {
  delete this.logins[key];
};

SMBServer.prototype.setupSession = function (login, accountName, primaryDomain, caseInsensitivePassword, caseSensitivePassword, cb) {
  var self = this;
  this.authenticator.authenticate(login.challenge, caseInsensitivePassword, caseSensitivePassword, primaryDomain, accountName, function (err, session) {
    if (err) {
      cb(err);
      return;
    }
    var smbSession = new SMBSession(self, accountName, primaryDomain, session);
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

module.exports = SMBServer;

