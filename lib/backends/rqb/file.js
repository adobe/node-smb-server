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
var RQFile = require('../rq/file');

var RQBasicFile = function (openFile, tree) {
    if (!(this instanceof RQBasicFile)) {
        return new RQBasicFile(openFile, tree);
    }

    RQFile.call(this, openFile, tree);
};

// the RQBasicFile prototype inherits from RQFile
util.inherits(RQBasicFile, RQFile);

RQBasicFile.createInstance = function (openFile, tree, cb) {
    cb(null, new RQBasicFile(openFile, tree));
};

/**
 * Overridden so that the resulting file is "read-only," meaning that write operations
 * to the file will do nothing.
 * @param {Function} cb callback called after caching is complete
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file File instance for consumption
 */
RQBasicFile.prototype.cacheFile = function (cb) {
    var self = this;
    RQFile.prototype.cacheFile.call(this, function (err, file) {
        if (err) {
            self.tree.handleErr(cb, err);
        } else {
            file.write = function (data, position, fileCb) {
                // do nothing on writes
                fileCb();
            };
            file.setLength = function (length, fileCb) {
                // do nothing when setting length
                fileCb();
            };
            file.flush = function (fileCb) {
                // do nothing on flush
                fileCb();
            };
            cb(null, file);
        }
    });
};

module.exports = RQBasicFile;
