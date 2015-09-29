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

var utils = require('./utils');

var ANONYMOUS_KEY = 0;

/**
 * Represents a login attempt as initiated by <code>NEGOTIATE</code> and
 * successfully finished by <code>SESSION_SETUP_ANDX</code>
 */
function SMBLogin(smbServer, challenge) {
  this.smbServer = smbServer;
  if (challenge) {
    this.challenge = challenge;
    this.key = ++SMBLogin.keyCounter;
  } else {
    // represents anonymous login
    this.challenge = utils.EMPTY_BUFFER;
    this.key = ANONYMOUS_KEY;
  }
}

SMBLogin.prototype.isAnonymous = function () {
  return this.key === ANONYMOUS_KEY;
};

SMBLogin.keyCounter = 0;

module.exports = SMBLogin;

