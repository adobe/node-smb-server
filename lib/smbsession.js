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

/**
 * Represents an SMB session established by <code>SESSION_SETUP_ANDX</code>
 */
function SMBSession(smbServer, login, accountName, primaryDomain) {
  this.smbServer = smbServer;
  this.login = login;
  this.accountName = accountName;
  this.primaryDomain = primaryDomain;
  this.uid = ++SMBSession.uidCounter;
}

SMBSession.uidCounter = 0;

module.exports = SMBSession;

