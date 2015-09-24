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
 * Creates an instance of Authenticator.
 *
 * @constructor
 * @this {Authenticator}
 */
var Authenticator = function () {
  if (! (this instanceof Authenticator)) {
    return new Authenticator();
  }
};

Authenticator.prototype.authenticate = function (challenge, caseInsensitivePassword, caseSensitivePassword, domainName, accountName, cb) {
  process.nextTick(function () { cb(new Error('abstract method')); });
};

module.exports = Authenticator;
