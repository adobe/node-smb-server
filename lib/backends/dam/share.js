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

var Util = require('util');

var request = require('request');

var utils = require('../../utils');
var JCRShare = require('../jcr/share');
var DAMTree = require('./tree');
var DAM = require('./constants');

/**
 * Creates an instance of JCRShare.
 *
 * @constructor
 * @this {JCRShare}
 * @param {String} name share name
 * @param {Object} config configuration hash
 */
var DAMShare = function (name, config) {
  if (!(this instanceof DAMShare)) {
    return new DAMShare(name, config);
  }
  config = config || {};
  if (!config.path) {
    config.path = DAM.DAM_ROOT_PATH;
  }
  JCRShare.call(this, name, config);
};

// the DAMShare prototype inherits from JCRShare
Util.inherits(DAMShare, JCRShare);

DAMShare.prototype.isAssetClass = function (entity) {
  var cls = (entity && entity[DAM.CLASS]) || [];
  return cls.indexOf(DAM.CLASS_ASSET) > -1;
};

DAMShare.prototype.isFolderClass = function (entity) {
  var cls = (entity && entity[DAM.CLASS]) || [];
  return cls.indexOf(DAM.CLASS_FOLDER) > -1;
};

//-----------------------------------------------------------------< JCRShare >

DAMShare.prototype.parseContentChildEntries = function (content, iterator) {
  var self = this;
  var entities = content[DAM.ENTITIES] || [];
  entities.forEach(function (entity) {
    var nm = entity[DAM.PROPERTIES] && entity[DAM.PROPERTIES][DAM.NAME];
    if (nm) {
      if (self.isAssetClass(entity) || self.isFolderClass(entity)) {
        iterator(nm, entity);
      }
    }
  });
};

DAMShare.prototype.fetchContent = function (path, deep, cb) {
  if (path === '/') {
    path = '';
  }
  var url = 'http://' + this.host + ':' + this.port + DAM.ASSETS_API_PATH + utils.stripParentPath(this.path, DAM.DAM_ROOT_PATH) + path + '.json'
      + '?limit=9999&showProperty=jcr:created&showProperty=jcr:lastModified&showProperty=asset:size&showProperty=asset:readonly';
  var opts = this.applyRequestDefaults(null, url);
  request(opts, function (err, resp, body) {
    if (err) {
      cb(err);
    } else if (resp.statusCode === 200) {
      // succeeded
      try {
        cb(null, JSON.parse(body));
      } catch (parseError) {
        cb(parseError);
      }
    } else if (resp.statusCode === 404) {
      // not found, return null
      cb(null, null);
    } else {
      // failed
      cb(this.method + ' ' + this.href + ' [' + resp.statusCode + '] ' + body || '');
    }
  });
};

DAMShare.prototype.createTreeInstance = function (content, tempFilesTree) {
  return new DAMTree(this, content, tempFilesTree);
};

//--------------------------------------------------------------------< Share >

/**
 * Return a flag indicating whether this is a named pipe share.
 *
 * @return {Boolean} <code>true</code> if this is a named pipe share;
 *         <code>false</code> otherwise, i.e. if it is a disk share.
 */
DAMShare.prototype.isNamedPipe = function () {
  // call base class method
  return JCRShare.prototype.isNamedPipe.call(this);
};

/**
 *
 * @param {Session} session
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Tree} cb.tree connected tree
 */
DAMShare.prototype.connect = function (session, shareLevelPassword, cb) {
  // call base class method
  return JCRShare.prototype.connect.call(this, session, shareLevelPassword, cb);
};

module.exports = DAMShare;

