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

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var logger = require('winston').loggers.get('spi');
var utils = require('../../utils');
var request = require('request');
var fs = require('fs');
var URL = require('url');
var Path = require('path');
var RQFile = require('./file');

function RQProcessor(tree, requestQueue, options) {
    // call the super constructor to initialize `this`
    EventEmitter.call(this);

    var self = this;

    options = options || {};

    this.rq = requestQueue;
    this.tree = tree;
    this.share = tree.share;
    this.stopped = true;
    this.activeRequests = {};

    if (options.request) {
        request = options.request;
    }
    if (options.fs) {
        fs = options.fs;
    }

    this.rq.on('itemupdated', function (itemPath) {
        logger.debug('processor received itemupdated event for %s', itemPath);
        if (self.activeRequests[itemPath]) {
            // TODO: would be good to wrap activeRequests in some kind of mutex to prevent threading issues

            // cancel in-progress uploads if an item is updated
            logger.info('%s received a new request mid-upload. canceling upload.', itemPath);
            self.activeRequests[itemPath].abort();
            self.activeRequests[itemPath] = undefined;
        }
    });

    this.rq.on('pathupdated', function (path) {
        logger.debug('processor received pathupdated event for %s', path);
        for (var property in self.activeRequests) {
            if (property.length > root.length) {
                if (property.substr(0, root.length + 1) == path + '/') {
                    logger.info('%s is part of path %s that was changed mid-upload. canceling upload', property, path);
                    self.activeRequests[property].abort();
                    self.activeRequests[property] = undefined;
                }
            }
        }
    });
}

util.inherits(RQProcessor, EventEmitter);

/**
 * Executes a sync process by retrieving the oldest ready request from the request queue and executing
 * it against the remote source. Will continue to execute until there are no more pending requests in the
 * queue.
 * @param {Object} config Various configuration options for controlling how the sync will behave.
 * @param {Int} config.expiration The age, in milliseconds, that a request much reach before it will be processed.
 * @param {Int} config.maxRetries The maximum number of times that the processor will attempt to sync a file before purging it.
 * @param {Int} config.retryDelay The amount of time, in milliseconds, that the processor will wait before attempting to retry syncing a record.
 */
RQProcessor.prototype.sync = function (config, cb) {
    var self = this;
    var processItemMethod = function (item, method, cb) {
        var handleError = function (path, method, err) {
            logger.error('encountered exception while attempting to process local file %s', path, err);
            self.emit('syncerr', {file: path, method: method, err: err});
            self.rq.incrementRetryCount(item.path, item.name, config.retryDelay, function (err) {
                if (err) {
                    logger.error('unable to update retry count for path %s', path, err);
                }
                self.sync(config, cb);
            });
        };

        var refPath = Path.join(item.path, item.name);
        var url = item.remotePrefix + refPath;
        var path = Path.join(item.localPrefix, refPath);

        self.emit('syncstart', {file: path, method: method});

        if (method == 'PUT') {
            method = 'POST';
        } else if (method == 'POST') {
            method = 'PUT';
        }

        var options = self.share.applyRequestDefaults({
            url: url,
            method: method,
            headers: {}
        });

        var getRequest = function () {
            return request(options, function (err, resp, body) {
                if (err) {
                    // failed
                    handleError(path, method, err);
                } else if (resp.statusCode != 200 && resp.statusCode != 201) {
                    handleError(path, method, 'unexpected status code: ' + resp.statusCode);
                } else {
                    self.rq.removeRequest(item.path, item.name, function (err) {
                        if (err) {
                            handleError(path, method, err);
                        } else {
                            self.tree.refreshWorkFiles(refPath, function (err) {
                                if (err) {
                                    logger.error('unable to delete work files for local file %s', path, err);
                                }
                                self.emit('syncend', {file: path, method: method});
                                self.sync(config, cb);
                            });
                        }
                    });
                }
            })
        };

        if (method == 'POST' || method == 'PUT') {
            options.headers['content-type'] = utils.lookupMimeType(path);
            var read;
            try {
                read = fs.createReadStream(path);
            } catch (e) {
                handleError(path, method, e);
                return;
            }

            read.on('error', function (err) {
                handleError(path, method, err);
            });

            var req = getRequest();
            logger.debug('adding path %s to list of active uploads', refPath);
            self.activeRequests[refPath] = req;
            read.pipe(req).on('end', function () {
                // TODO: would be good to wrap this in some kind of mutex to prevent threading issues

                // remove active request from queue when finished
                logger.debug('removing path %s from list of active uploads', refPath);
                self.activeRequests[refPath] = undefined;
                self.tree.share.invalidateContentCache(item.path, true);
            });
        } else {
            getRequest();
        }
    };

    self.rq.getProcessRequest(config.expiration, config.maxRetries, function (err, item) {
        if (err) {
            cb(err);
        } else {
            if (item) {
                processItemMethod(item, item.method, cb);
            } else {
                cb();
            }
        }
    });
};

/**
 * Starts the processor by initiating a loop that will run on a regular interval. The loop will check for any
 * requests that are ready to be synced and will perform the operations.
 * @param {Object} config Various configuration options for controlling how the processor will behave.
 * @param {Int} config.maxRetries The maximum number of times that the processor will attempt to sync a file before purging it.
 * @param {Int} config.frequency The amount of time, in milliseconds, between each execution of the processing workflow.
 */
RQProcessor.prototype.start = function (config) {
    var self = this;
    self.stopped = false;



    var eventLoop = function () {
        self.timeout = setTimeout(function () {
            self.sync(config, function (err) {
                if (err) {
                    self.emit('error', err);
                }

                self.rq.purgeFailedRequests(config.maxRetries, function (err, purged) {
                    if (err) {
                        self.emit('error', err);
                    } else {
                        if (purged.length) {
                            self.emit('purged', purged);
                        }
                    }

                    if (!self.stopped) {
                        eventLoop();
                    }
                });
            });
        }, config.frequency);
    };
    eventLoop();
};

/**
 * Stops the processor by exiting the event loop.
 */
RQProcessor.prototype.stop = function () {
    if (this.timeout) {
        clearTimeout(this.timeout);
    }
    this.stopped = true;
};

module.exports = RQProcessor;
