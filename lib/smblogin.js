/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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

