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
 * Creates an instance of Session. Allows an implementation to perform cleanup tasks on logoff.
 *
 * @constructor
 * @this {Session}
 */
var Session = function () {
  if (! (this instanceof Session)) {
    return new Session();
  }
};

Session.prototype.logoff = function () {
  process.nextTick(function () { cb(new Error('abstract method')); });
};

module.exports = Session;
