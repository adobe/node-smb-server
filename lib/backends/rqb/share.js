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
var RQShare = require('../rq/share');
var RQBasicTree = require('./tree');

var RQBasicShare = function (name, config, remoteShare, remoteTree, localTree, workTree) {
    if (!(this instanceof RQBasicShare)) {
        return new RQBasicShare(name, config, remoteShare, remoteTree, localTree, workTree);
    }

    RQShare.call(this, name, config, remoteShare, remoteTree, localTree, workTree);
};

// the RQBasicShare prototype inherits from RQShare
util.inherits(RQBasicShare, RQShare);

RQBasicShare.prototype.createTree = function (remoteTree, config) {
    return new RQBasicTree(this, remoteTree, config);
};

module.exports = RQBasicShare;
