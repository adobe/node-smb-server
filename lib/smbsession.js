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

/**
 * Represents an SMB session established by <code>SESSION_SETUP_ANDX</code>
 */
function SMBSession(smbServer, accountName, primaryDomain, spiSession) {
  this.smbServer = smbServer;
  this.spiSession = spiSession;
  this.accountName = accountName;
  this.primaryDomain = primaryDomain;
  this.uid = ++SMBSession.uidCounter;
  this.searches = {};
}

SMBSession.uidCounter = 0;

SMBSession.sidCounter = 0;

/**
 * Creates a new search state
 *
 * @return {{sid: number}}
 */
SMBSession.prototype.createSearch = function () {
  var search = { sid: ++SMBSession.sidCounter };
  // register search
  this.searches[search.sid] = search;
  return search;
};

/**
 * Returns the search state associated with the given search id.
 *
 * @param {Number} sid search id
 * @return {Object}
 */
SMBSession.prototype.getSearch = function (sid) {
  return this.searches[sid];
};

/**
 * Close the search, i.e. release any resources associated with the given search id.
 *
 * @param {Number} sid search id
 */
SMBSession.prototype.closeSearch = function (sid) {
  delete this.searches[sid];
};

SMBSession.prototype.logoff = function () {
  if (this.spiSession) {
    this.spiSession.logoff();
  }
  this.smbServer.destroySession(this.uid);
};

module.exports = SMBSession;

