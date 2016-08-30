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

function RQProcessor(tree, options) {
    // call the super constructor to initialize `this`
    EventEmitter.call(this);

    var self = this;

    options = options || {};

    this.rq = tree.rq;
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
        if (self.abortUpload(itemPath)) {
            self.sync(self.currConfig, self.currCb);
        }
    });

    this.rq.on('pathupdated', function (path) {
        logger.debug('processor received pathupdated event for %s', path);

        var prefix = path;
        if (prefix != '/') {
            prefix += '/';
        }
        for (var property in self.activeRequests) {
            if (property.length > prefix.length) {
                if (property.substr(0, prefix.length) == prefix) {
                    if (self.abortUpload(property)) {
                        self.sync(self.currConfig, self.currCb);
                    }
                }
            }
        }
    });
}

util.inherits(RQProcessor, EventEmitter);

/**
 * Looks at the current in-progress requests and aborts the request for a given path if it's found to be
 * in-progress.
 * @param {String} itemPath The path to the item to abort.
 * @return {Bool} Indicates whether a request was aborted or not.
 */
RQProcessor.prototype.abortUpload = function (itemPath) {
    // TODO: would be good to wrap activeRequests in some kind of mutex to prevent threading issues
    var self = this;
    if (self.activeRequests[itemPath]) {
        // cancel in-progress uploads if an item is updated
        logger.info('%s received a new request mid-upload. canceling upload.', itemPath);
        self.activeRequests[itemPath].abort();
        self.activeRequests[itemPath] = undefined;
        self.emit('syncabort', {file: itemPath});
        return true;
    }
    return false;
};

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
    self.currConfig = config;
    self.currCb = cb;
    var processItemMethod = function (item, method, processCb) {
        var refPath = Path.join(item.path, item.name);
        var removeActiveUpload = function () {
            // TODO: would be good to wrap this in some kind of mutex to prevent threading issues

            // remove active request from queue when finished
            logger.debug('removing path %s from list of active uploads', refPath);
            self.activeRequests[refPath] = undefined;
        };
        var handleError = function (path, method, err, immediateFail) {
            logger.error('encountered exception while attempting to process local file %s', path, err);
            self.emit('syncerr', {file: path, method: method, err: err});
            removeActiveUpload();
            if (immediateFail) {
                self.rq.completeRequest(item.path, item.name, function (err) {
                    if (err) {
                        logger.error('unable to immediately remove request for path %s', path, err);
                    }
                    self.sync(config, processCb);
                });
            } else {
                self.rq.incrementRetryCount(item.path, item.name, config.retryDelay, function (err) {
                    if (err) {
                        logger.error('unable to update retry count for path %s', path, err);
                    }
                    self.sync(config, processCb);
                });
            }
        };

        var url = item.remotePrefix + encodeURI(refPath);
        var path = Path.join(item.localPrefix, refPath);

        if (method == 'PUT') {
            method = 'POST';
        } else if (method == 'POST') {
            method = 'PUT';
        }

        self.emit('syncstart', {file: path, method: method});

        if (path.match(/\/\./g)) {
            logger.warn('%s: attempt to sync path containing names beginning with a period', path);
            handleError(path, method, 'files containing names beginning with a period are forbidden', true);
        } else {
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
                        logger.debug('received response with invalid status code %d', resp.statusCode);
                        handleError(path, method, 'unexpected status code: ' + resp.statusCode);
                    } else {
                        logger.debug('path [%s] name [%s] request completed', item.path, item.name);
                        self.rq.completeRequest(item.path, item.name, function (err) {
                            if (err) {
                                handleError(path, method, err);
                            } else {
                                var endSync = function () {
                                    self.emit('syncend', {file: path, method: method});
                                    self.sync(config, processCb);
                                };
                                removeActiveUpload();
                                self.tree.share.invalidateContentCache(utils.unicodeNormalize(item.path), true);
                                if (method != 'DELETE') {
                                    self.tree.refreshWorkFiles(utils.unicodeNormalize(refPath), function (err) {
                                        if (err) {
                                            logger.error('unable to delete work files for local file %s', path, err);
                                        }
                                        endSync();
                                    });
                                } else {
                                    // no need to refresh work files for deleted items
                                    endSync();
                                }
                            }
                        });
                    }
                })
            };

            if (method == 'POST' || method == 'PUT') {
                options.headers['content-type'] = utils.lookupMimeType(path);
                var read;
                try {
                    read = fs.createReadStream(utils.unicodeNormalize(path));
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
                read.pipe(req);
            } else {
                getRequest();
            }
        }
    };

    logger.debug('checking for requests that need to be processed');
    self.rq.getProcessRequest(config.expiration, config.maxRetries, function (err, item) {
        if (err) {
            cb(err);
        } else {
            if (item) {
                logger.debug('path [%s] name [%s] beginning to process', item.path, item.name);
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
    logger.info('starting request queue processor');
    var self = this;
    self.stopped = false;

    var doSync = function (cb) {
        logger.debug('request queue processor starting sync process');
        self.sync(config, function (err) {
            if (err) {
                self.emit('error', err);
            }

            self.rq.purgeFailedRequests(config.maxRetries, function (err, purged) {
                if (err) {
                    self.emit('error', err);
                } else {
                    if (purged.length) {
                        logger.debug('found purged requests, sending event');
                        self.emit('purged', purged);
                    }
                }

                logger.debug('request queue processor ending sync process');

                if (!self.stopped) {
                    cb();
                }
            });
        });
    };

    var eventLoop = function () {
        self.timeout = setTimeout(function () {
            doSync(eventLoop);
        }, config.frequency);
    };

    // immediately sync on start
    doSync(eventLoop);
};

/**
 * Stops the processor by exiting the event loop.
 */
RQProcessor.prototype.stop = function () {
    logger.info('stopping request queue processor');
    var self = this;
    if (this.timeout) {
        logger.debug('clearing event loop timeout');
        clearTimeout(this.timeout);
    }
    // abort any active requests
    for (var property in self.activeRequests) {
        self.abortUpload(property);
    }
    this.stopped = true;
};

module.exports = RQProcessor;
