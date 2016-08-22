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

var RQProcessor = require('../../../../lib/backends/rq/rqprocessor');
var RQCommon = require('./rq-common');
var RequestQueue = require('../../../../lib/backends/rq/requestqueue');

describe('RQProcessor', function () {
    var processor, c, rq, req, config;

    beforeEach(function () {
        c = new RQCommon();
        rq = new RequestQueue({db: c.db});
        req = function (options, cb) {
            return {
                emit: function (toEmit) {
                    if (toEmit == 'end') {
                        cb(null, {
                            statusCode: 200
                        }, '');
                    }
                }
            };
        };

        processor = new RQProcessor(c.testTree, rq, {
            fs: c.fs,
            request: req
        });

        config = {
            expiration: 0,
            maxRetries: 3,
            retryDelay: 200
        };

        spyOn(processor, 'emit').andCallThrough();
    });

    describe('RQUpdated', function () {
        it('testItemUpdatedNotUploading', function (done) {
            c.addQueuedFile('/testfile', function () {
                c.fs.setTestFile('/local/path/testfile', '/testfile');
                processor.sync(config, function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExist('/testfile', true, false, function () {
                        c.expectQueuedMethod('/', 'testfile', false, done);
                    });
                });
            });
        });
    });
});
