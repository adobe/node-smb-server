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

var Path = require('path');

var lm = require('./lib/auth').lm;
var ntlm = require('./lib/auth').ntlm;

if (process.argv.length === 3) {
  var pwd = process.argv[2];
  if (pwd === '-e') {
    pwd = '';
  }
  console.log('\nPassword:  %s', pwd);
  console.log('NT Hash:   %s', lm.createHash(pwd).toString('hex'));
  console.log('NTLM Hash: %s\n', ntlm.createHash(pwd).toString('hex'));
} else {
  console.log('Usage: node %s [ <password> | -e ]\n\n-e : empty password', Path.basename(__filename));
}

