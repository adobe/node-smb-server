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

var util = require('util');
var _ = require('lodash');
var logger = require('winston').loggers.get('spi');

var ntlm = require('./ntlm');

var Authenticator = require('./spi/authenticator');
var Session = require('./spi/session');

/**
 * Creates an instance of DefaultSession.
 *
 * @constructor
 * @this {DefaultSession}
 */
var DefaultSession = function (accountName, domainName) {
  if (!(this instanceof DefaultSession)) {
    return new DefaultSession(accountName, domainName);
  }

  this.accountName = accountName;
  this.domainName = domainName;

  Session.call(this);
};

DefaultSession.prototype.logoff = function () {
  // nothing to do here
  var account = this.domainName && this.domainName !== '' ? this.domainName + '\'' + this.accountName : this.accountName;
  logger.debug('logged off %s', account);
};

/**
 * Creates an instance of DefaultAuthenticator.
 *
 * @constructor
 * @this {DefaultAuthenticator}
 * @param {Object} config configuration hash
 */
var DefaultAuthenticator = function (config) {
  if (!(this instanceof DefaultAuthenticator)) {
    return new DefaultAuthenticator(config);
  }

  this.config = _.cloneDeep(config);

  Authenticator.call(this);
};

// the DefaultAuthenticator prototype inherits from Authenticator
util.inherits(DefaultAuthenticator, Authenticator);

DefaultAuthenticator.prototype.authenticate = function (challenge, caseInsensitivePassword, caseSensitivePassword, domainName, accountName, cb) {
  // challenge -> server challenge
  // caseInsensitivePassword -> client LM or LMv2 hash
  // caseSensitivePassword -> client NTLM or NTLMv2 hash

  var userName = accountName.toLowerCase();
  var user = this.config.users[userName];
  if (!user) {
    logger.debug('authentication failed: unknown user: %s', userName);
    cb(new Error('unknown user'));
    return;
  }

  var lmHash = new Buffer(user.lmHash, 'hex');
  var ntlmHash = new Buffer(user.ntlmHash, 'hex');

  var authenticated = false;

  if (caseSensitivePassword.length === ntlm.ntlm.RESPONSE_LENGTH) {
    // NTLM
    authenticated = ntlm.validateNTLMResponse(caseSensitivePassword, ntlmHash, challenge);
  } else if (caseSensitivePassword.length >= ntlm.ntlm2.MIN_RESPONSE_LENGTH) {
    // NTLMv2
    authenticated = ntlm.validateNTLMv2Response(caseSensitivePassword, ntlmHash, accountName, domainName, challenge);
  } else if (caseInsensitivePassword.length === ntlm.lm.RESPONSE_LENGTH || caseInsensitivePassword.length === ntlm.lm2.RESPONSE_LENGTH) {
    // assume LMv2 or LM
    authenticated = ntlm.validateLMv2Response(caseInsensitivePassword, ntlmHash, accountName, domainName, challenge)
      || ntlm.validateLMResponse(caseInsensitivePassword, lmHash, challenge);
  } else {
    logger.warn('invalid/unsupported credentials: caseInsensitivePassword: %s, caseSensitivePassword: %s', caseInsensitivePassword.toString('hex'), caseSensitivePassword.toString('hex'));
    cb(new Error('invalid/unsupported credentials'));
    return;
  }

  if (!authenticated) {
    logger.debug('failed to authenticate user %s: invalid credentials', userName);
    cb(new Error('invalid credentials'));
    return;
  }

  cb(null, new DefaultSession(accountName, domainName));
};

module.exports = DefaultAuthenticator;
