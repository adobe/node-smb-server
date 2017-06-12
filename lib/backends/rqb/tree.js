/*
 *  Copyright 2016 Adobe Systems Incorporated. All rights reserved.
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

var util = require('util');
var RQTree = require('../rq/tree');
var RQBasicFile = require('./file');

var RQBasicTree = function (share, remote, options) {
    if (!(this instanceof RQBasicTree)) {
        return new RQBasicTree(share, remote, options);
    }

    RQTree.call(this, share, remote, options);
};

// the RQBasicTree prototype inherits from RQTree
util.inherits(RQBasicTree, RQTree);

RQBasicTree.prototype.createFileInstanceFromOpen = function (openFile, cb) {
  RQBasicFile.createInstance(openFile, this, cb);
};

/**
 * Overridden so that local operations don't happen.
 */
RQBasicTree.prototype.createLocalFile = function (name, cb) {
    this.open(name, function (err, file) {
        if (err) {
            cb(err);
        } else {
            // mark the file as dirty
            file.dirty = true;
            cb(null, file);
        }
    });
};

/**
 * Overridden so that local operations don't happen.
 */
RQBasicTree.prototype.createLocalDirectory = function (name, cb) {
    this.open(name, cb);
};

/**
 * Overridden so that local operations don't happen.
 */
RQBasicTree.prototype.deleteLocal = function (name, cb) {
    cb();
};

/**
 * Overridden so that local operations don't happen.
 */
RQBasicTree.prototype.deleteLocalDirectory = function (name, cb) {
    cb();
};

/**
 * Overridden so that local operations don't happen.
 */
RQBasicTree.prototype.renameLocal = function (oldName, newName, newCreated, cb) {
    cb();
};

/**
 * Overridden to use the work tree to determine existence.
 */
RQBasicTree.prototype.existsLocal = function (name, cb) {
    var self = this;
    self.local.cacheInfoExists(name, function (err, exists) {
        if (err) {
            cb(err);
        } else if (!exists && self.isTempFileName(name)) {
            // in the case of temp files, a work file will never exist. Always
            // report that temp files exist so that the rest of the workflow will be
            // run on temp files
            cb(null, true);
        } else {
            cb(null, exists);
        }
    });
};

/**
 * Overridden to use the local tree to determine existence.
 */
RQBasicTree.prototype.isLocalDirectory = function (name, cb) {
  this.local.isLocalDirectory(name, cb);
};

module.exports = RQBasicTree;
