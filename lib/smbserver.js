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

var consts = require('./constants');
var auth = require('./auth');
var os = require('os');
var SMBLogin = require('./smblogin');
var SMBSession = require('./smbsession');

function SMBServer(config, tcpServer) {
  this.tcpServer = tcpServer;
  this.logins = {};
  this.sessions = {};
  this.domainName = config && config.domainName || '';
  this.nativeOS = os.type() + ' ' + os.release();
  this.nativeLanMan = consts.NATIVE_LANMAN;
  this.config = config || {};
}

SMBServer.prototype.createLogin = function () {
  var challenge = auth.createChallenge();
  var login = new SMBLogin(this, challenge);
  this.logins[login.key] = login;
  return login;
};

SMBServer.prototype.getLogin = function (key) {
  return this.logins[key];
};

SMBServer.prototype.setupSession = function (login, accountName, primaryDomain, caseInsensitivePassword, caseSensitivePassword) {
  // todo authenticate (clear-text passwords disabled)
  // login.challenge -> server challenge
  // caseInsensitivePassword -> client LM or LMv2 hash
  // caseSensitivePassword -> client NTLM or NTLMv2 hash

  if (caseSensitivePassword.length == 24) {
    // assume NTLM
  } else if (caseSensitivePassword.length > 24) {
    // assume NTLMv2
  } else {
    // ??
  }

  // todo configure account name and NTLM hash
  var hash = auth.ntlm.createHash('admin');
  var resp = auth.ntlm.calculateResponse(hash, login.challenge);

  var session = new SMBSession(this, login, accountName, primaryDomain);
  this.sessions[session.uid] = session;
  return session;
};

SMBServer.prototype.getSession = function (uid) {
  return this.sessions[uid];
};

module.exports = SMBServer;

