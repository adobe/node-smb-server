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
  this.allowAnonymous = config.allowAnonymous;
}

SMBServer.prototype.createLogin = function () {
  var challenge = this.allowAnonymous ? null : auth.createChallenge();
  var login = new SMBLogin(this, challenge);
  this.logins[login.key] = login;
  return login;
};

SMBServer.prototype.getLogin = function (key) {
  return this.logins[key];
};

SMBServer.prototype.setupSession = function (login, accountName, primaryDomain, caseInsensitivePassword, caseSensitivePassword) {
  // login.challenge -> server challenge
  // caseInsensitivePassword -> client LM or LMv2 hash
  // caseSensitivePassword -> client NTLM or NTLMv2 hash

  var userName = accountName.toLowerCase();
  var user = this.config.users[userName];
  if (!user) {
    logger.debug('authentication failed: unknown user: %s', userName);
    return null;
  }

  var lmHash = new Buffer(user.lmHash, 'hex');
  var ntlmHash = new Buffer(user.ntlmHash, 'hex');

  var authenticated = false;

  if (caseSensitivePassword.length == auth.ntlm.RESPONSE_LENGTH) {
    // NTLM
    authenticated = auth.validateNTLMResponse(caseSensitivePassword, ntlmHash, login.challenge);
  } else if (caseSensitivePassword.length >= auth.ntlm2.MIN_RESPONSE_LENGTH) {
    // NTLMv2
    authenticated = auth.validateNTLMv2Response(caseSensitivePassword, ntlmHash, accountName, primaryDomain, login.challenge);
  } else if (caseInsensitivePassword.length == auth.lm.RESPONSE_LENGTH || caseInsensitivePassword.length == auth.lm2.RESPONSE_LENGTH) {
    // assume LMv2 or LM
    authenticated = auth.validateLMv2Response(caseInsensitivePassword, ntlmHash, accountName, primaryDomain, login.challenge)
      || auth.validateLMResponse(caseInsensitivePassword, lmHash, login.challenge);
  } else {
    logger.warn('invalid/unsupported credentials: caseInsensitivePassword: %s, caseSensitivePassword: %s', caseInsensitivePassword.toString('hex'), caseSensitivePassword.toString('hex'));
    return null;
  }

  if (!authenticated) {
    logger.debug('failed to authenticate user %s: invalid credentials', userName);
    return null;
  }

  var session = new SMBSession(this, login, accountName, primaryDomain);
  this.sessions[session.uid] = session;
  return session;
};

SMBServer.prototype.getSession = function (uid) {
  return this.sessions[uid];
};

module.exports = SMBServer;

