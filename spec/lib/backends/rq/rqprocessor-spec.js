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
var Path = require('path');

describe('RQProcessor', function () {
    var processor, c, rq, req, config, nextStatusCode;

    beforeEach(function () {
        c = new RQCommon();
        req = function (options, cb) {
            var statusCode = 200;
            if (nextStatusCode) {
                statusCode = nextStatusCode;
                nextStatusCode = false;
            }
            if (options.method != 'POST' && options.method != 'PUT') {
                cb(null, {
                    statusCode: statusCode
                }, '');
            } else {
                return {
                    emit: function (toEmit) {
                        if (toEmit == 'end') {
                            cb(null, {
                                statusCode: statusCode
                            }, '');
                        }
                    },
                    abort: function () {
                        this.aborted = true;
                    }
                };
            }
        };

        processor = new RQProcessor(c.testTree, {
            fs: c.fs,
            request: req
        });

        config = {
            expiration: 0,
            maxRetries: 3,
            retryDelay: 200,
            frequency: 500
        };

        spyOn(processor, 'emit').andCallThrough();
    });

    describe('RQUpdated', function () {
        it('testItemUpdatedUploading', function (done) {
            c.addQueuedFile('/testfile', function () {
                c.fs.setTestFile('/local/path/testfile', '/testfile');
                c.setPipeDelay(1000);
                processor.sync(config, function (err) {
                    expect(err).toBeFalsy();
                    expect(processor.emit).toHaveBeenCalledWith('syncabort', {file: '/testfile'});
                    expect(processor.emit).toHaveBeenCalledWith('syncend', {file: '/local/path/testfile', method: 'POST'});
                    done();
                });
                setTimeout(function () {
                    c.testTree.rq.queueRequest({
                        method: 'POST',
                        path: '/testfile',
                        localPrefix: '/somelocal',
                        remotePrefix: 'http://localhost:4502'
                    }, function (err) {
                        // do nothing
                    });
                }, 500);
            });
        });

        it('testItemUpdatedNotUploading', function (done) {
            c.addQueuedFile('/testfile', function () {
                c.fs.setTestFile('/local/path/testfile', '/testfile');
                c.testTree.rq.queueRequest({
                    method: 'POST',
                    path: '/testfile',
                    localPrefix: '/somelocal',
                    remotePrefix: 'http://localhost:4502'
                }, function (err) {
                    expect(err).toBeFalsy();
                    c.expectQueuedMethod('/', 'testfile', 'PUT', function () {
                        expect(processor.emit).not.toHaveBeenCalledWith('syncabort', {file: '/testfile'});
                        done();
                    });
                });
            });
        });

        var testPathUpdated = function (path, removePath, done) {
            c.addQueuedFile(path, function () {
                c.fs.setTestFile('/local/path' + path, path);
                c.setPipeDelay(1000);
                processor.sync(config, function (err) {
                    expect(err).toBeFalsy();
                    expect(processor.emit).toHaveBeenCalledWith('syncabort', {file: path});
                    expect(processor.emit).not.toHaveBeenCalledWith('syncend', {file: '/local/path' + path, method:'POST'});
                    done();
                });
                setTimeout(function () {
                    c.testTree.rq.removePath(removePath, function (err) {
                        // do nothing
                    });
                }, 500);
            });
        };

        it('testPathUpdatedUploading', function (done) {
            testPathUpdated('/testfile', '/', done);
        });

        it('testPathUpdatedUploadingSubPath', function (done) {
            testPathUpdated('/dir/testfile', '/', done);
        });

        it('testPathUpdatedUploadingSubPathNotRoot', function (done) {
            testPathUpdated('/dir/testfile', '/dir', done);
        });
    });

    describe('Sync', function () {
        var testDotFile = function (path, name, done) {
            c.testTree.rq.getProcessRequest = function (expiration, maxRetries, cb) {
                cb(null, {
                    path: path,
                    name: name,
                    method: 'DELETE',
                    remotePrefix: 'http://localhost:4502',
                    localPrefix: '/somelocal'
                });
            };
            c.testTree.rq.completeRequest = function (path, name, cb) {
                c.testTree.rq.getProcessRequest = function (expiration, maxRetries, getCb) {
                    getCb();
                };
                cb();
            };
            processor.sync(config, function (err) {
                expect(err).toBeFalsy();
                expect(processor.emit).toHaveBeenCalledWith('syncerr', {file: '/somelocal' + Path.join(path, name), method: 'DELETE', err: jasmine.any(String)});
                done();
            });
        };

        var addLocalCachedFile = function (path, cb) {
            c.addFile(c.remoteTree, '/testfile', function () {
                c.fs.setTestFile('/local/path' + path, path);
                c.testTree.open('/testfile', function (err, file) {
                    expect(err).toBeFalsy();
                    file.cacheFile(function (err) {
                        expect(err).toBeFalsy();
                        cb(file);
                    });
                });
            });
        };

        it('testSyncCreate', function (done) {
            c.addQueuedFile('/testfile', function () {
                c.fs.setTestFile('/local/path/testfile', '/testfile');
                processor.sync(config, function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExist('/testfile', true, false, function () {
                        c.expectQueuedMethod('/', 'testfile', false, function () {
                            expect(processor.emit).toHaveBeenCalledWith('syncstart', {file: '/local/path/testfile', method: 'POST'});
                            expect(processor.emit).toHaveBeenCalledWith('syncend', {file: '/local/path/testfile', method: 'POST'});
                            done();
                        });
                    });
                });
            });
        });

        it('testSyncUpdate', function (done) {
            addLocalCachedFile('/testfile', function (file) {
                file.setLength(100, function (err) {
                    expect(err).toBeFalsy();
                    file.close(function (err) {
                        expect(err).toBeFalsy();
                        processor.sync(config, function (err) {
                            expect(err).toBeFalsy();
                            c.expectQueuedMethod('/', 'testfile', false, function () {
                                expect(processor.emit).toHaveBeenCalledWith('syncstart', {file: '/local/path/testfile', method: 'PUT'});
                                expect(processor.emit).toHaveBeenCalledWith('syncend', {file: '/local/path/testfile', method: 'PUT'});
                                done();
                            });
                        });
                    });
                });
            });
        });

        it('testSyncDelete', function (done) {
            addLocalCachedFile('/testfile', function (file) {
                c.testTree.delete('/testfile', function (err) {
                    expect(err).toBeFalsy();
                    processor.sync(config, function (err) {
                        expect(err).toBeFalsy();
                        c.expectQueuedMethod('/', 'testfile', false, function () {
                            expect(processor.emit).toHaveBeenCalledWith('syncstart', {file: '/local/path/testfile', method: 'DELETE'});
                            expect(processor.emit).toHaveBeenCalledWith('syncend', {file: '/local/path/testfile', method: 'DELETE'});
                            done();
                        });
                    });
                });
            });
        });

        it('testSyncDotFile', function (done) {
            testDotFile('/', '.badfile', done);
        });

        it('testSyncDotFolder', function (done) {
            testDotFile('/.badfolder', 'testfile', done);
        });

        it('testSyncErrorStatusCode', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                c.fs.setTestFile('/local/path/testfile', '/testfile');
                nextStatusCode = 404;
                processor.sync(config, function (err) {
                    expect(err).toBeFalsy();
                    c.expectQueuedMethod('/', 'testfile', 'PUT', function () {
                        expect(processor.emit).toHaveBeenCalledWith('syncerr', {file: '/local/path/testfile', method: 'POST', err: jasmine.any(String)});
                        c.testTree.rq.queueRequest({
                            method: 'DELETE',
                            path: '/testfile',
                            localPrefix: '/local/path',
                            remotePrefix: 'http://localhost:4502'
                        }, function (err) {
                            expect(err).toBeFalsy();
                            expect(processor.emit).not.toHaveBeenCalledWith('syncabort', {file:any(String)});
                            done();
                        });
                    });
                });
            });
        });
    });

    describe('StartStop', function () {
        it('testStartStop', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                c.fs.setTestFile('/local/path/testfile', '/testfile');
                c.testTree.rq.queueRequest({
                    method: 'DELETE',
                    path: '/testdelete',
                    localPrefix: '/local/path',
                    remotePrefix: 'http://localhost:4502'
                }, function (err) {
                    expect(err).toBeFalsy();
                    c.testTree.rq.incrementRetryCount('/', 'testdelete', 400, function (err) {
                        expect(err).toBeFalsy();
                        processor.start(config);
                        setTimeout(function () {
                            processor.stop();
                            expect(processor.emit).toHaveBeenCalledWith('syncstart', {file: '/local/path/testfile', method: 'POST'});
                            expect(processor.emit).toHaveBeenCalledWith('syncend', {file: '/local/path/testfile', method: 'POST'});
                            expect(processor.emit).toHaveBeenCalledWith('syncstart', {file: '/local/path/testdelete', method: 'DELETE'});
                            expect(processor.emit).toHaveBeenCalledWith('syncend', {file: '/local/path/testdelete', method: 'DELETE'});
                            done();
                        }, 1000);
                    });
                });
            });
        });

        it('testStartStopPurgeRequests', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                config.maxRetries = 0;
                processor.start(config);
                setTimeout(function () {
                    processor.stop();
                    expect(processor.emit).toHaveBeenCalledWith('purged', any(Object));
                    expect(processor.emit).not.toHaveBeenCalledWith('syncstart', any(Object));
                    done();
                }, 200);
            });
        });

        it('testStartStopCancelRequest', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                c.fs.setTestFile('/local/path/testfile', 'test');
                c.setPipeDelay(1000);
                processor.start(config);
                setTimeout(function () {
                    processor.stop();
                    expect(processor.emit).toHaveBeenCalledWith('syncabort', {file: '/testfile'});
                    done();
                }, 200);
            });
        });
    });
});
