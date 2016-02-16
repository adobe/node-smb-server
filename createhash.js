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

