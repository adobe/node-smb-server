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

var util = require('util');

var logger = require('winston').loggers.get('spi');

var FSTree = require('../fs/tree');
var FSShare = require('../fs/share');
var RQFile = require('./file');

/**
 * Creates an instance of RQLocalTree.
 *
 * @constructor
 * @this {RQLocalTree}
 * @param {RQShare} share parent share
 */
var RQLocalTree = function (share, config) {
    if (!(this instanceof RQLocalTree)) {
        return new RQLocalTree(share);
    }

    this.share = share;

    FSTree.call(this, new FSShare("localrq", config));
};

// the RQTree prototype inherits from FSTree
util.inherits(RQLocalTree, FSTree);

module.exports = RQLocalTree;
