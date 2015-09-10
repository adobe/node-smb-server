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
var SMBLogin = require('./smblogin');

/**
 * Default challenge (generated random 8 bytes)
 */
var CHALLENGE = new Buffer([ 0xfa, 0x5e, 0x7e, 0xb4, 0xde, 0x82, 0xc2, 0x9a ]);

function SMBServer(config, tcpServer) {
  this.tcpServer = tcpServer;
  this.logins = {};
  this.domainName = config && config.domainName || '';
  this.config = config || {};
}

SMBServer.prototype.createLogin = function () {
  var login = new SMBLogin(this, CHALLENGE);
  this.logins[login.key] = login;
  return login;
};

SMBServer.prototype.getLogin = function (key) {
  return this.logins[key];
};

module.exports = SMBServer;

