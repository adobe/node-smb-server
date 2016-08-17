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
var DAMShare = require('../dam/share');
var mkdirp = require('mkdirp');
var utils = require('../../utils');
var Path = require('path');
var fs = require('fs');

var RQRemoteShare = function (name, config) {
    if (!(this instanceof RQRemoteShare)) {
        return new RQRemoteShare(name, config);
    }
    config = config || {};

    DAMShare.call(this, name, config);
};

util.inherits(RQRemoteShare, DAMShare);

RQRemoteShare.prototype.createResourceStream = function (path) {
    var localPath = Path.join(this.config.local.path, path);
    mkdirp.sync(utils.getParentPath(localPath));
    return fs.createWriteStream(localPath);
};

module.exports = RQRemoteShare;
