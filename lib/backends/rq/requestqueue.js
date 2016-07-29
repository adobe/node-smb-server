/*
 * ADOBE CONFIDENTIAL
 * __________________
 *
 *  Copyright 2015 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 */
'use strict';

var log = require('winston').loggers.get('spi');
var datastore = require('nedb');
var utils = require('../../utils');

/**
 * Creates a new RequestQueue instance.
 * @constructor
 */
function RequestQueue(options) {
    if (options.db !== undefined) {
        this.db = options.db;
    } else {
        this.db = new datastore({ filename: options.path + "/request-queue.nedb", autoload: true });
    }

    if (options.log !== undefined) {
        log = options.log;
    }
}

RequestQueue.prototype = {

    /**
     * Retrieves all requests that have been queued for a given parent directory.
     * @param {string} remoteDirUrl The full URL to the remote directory to check.
     * @param {callback} callback Function to call with results of get operation.
     * @param {String|Exception} callback.err Error that occurred (will be undefined on success)
     * @param {Object} callback.requestLookup object whose keys are remote urls and values are methods
     */
    getRequests: function(remoteDirUrl, callback) {
        var self = this;
        if (remoteDirUrl.charAt(remoteDirUrl.length - 1) == '/') {
            remoteDirUrl = remoteDirUrl.substr(0, remoteDirUrl.length - 1);
        }
        self.db.find({parentRemoteUrl: remoteDirUrl}, function (err, docs) {
            if (err) {
                log.warn("unexpected error while attempting to query request queue: " + err);
                callback(err);
            } else {
                log.debug("getCreateRequests: query for remote URL of %s returned %s records", remoteDirUrl, docs.length);

                var requestLookup = {};
                for (var i = 0; i < docs.length; i++) {
                    requestLookup[docs[i].remoteUrl] = docs[i].method;
                }

                callback(undefined, requestLookup);
            }
        });
    },

    /**
     * Increments the number of retry counts for a given request by 1.
     * @param {Object} request The request to be updated, as retrieved by getRequests or getProcessRequest.
     * @param {Function} callback Will be called after the update.
     * @param {String|Exception} callback.err Will be truthy if there were errors during the update.
     */
    incrementRetryCount: function (request, callback) {
        var retry = request.retries;
        if (!retry) {
            retry = 0;
        }

        retry++;

        this.db.update({localPath: request.localPath}, {$set: {retries: retry}}, function (err, numAffected) {
            if (!err) {
                callback(err);
            } else if (numAffected != 1) {
                callback('unexpected number of requests had retry count updated: ' + numAffected);
            } else {
                callback();
            }
        });
    },

    /**
     * Removes the request for a given local path from the queue.
     * @param {String} localPath The full local path of the item to remove. Only exactly matching records will be removed.
     * @param {Function} callback Function that will be called when removal is complete.
     * @param {String|Exception} callback.err If non-null, indicates that an error occurred.
     */
    removeRequest: function (localPath, callback) {
        this.db.remove({localPath: localPath}, {}, function (err, numRemoved) {
            if (err) {
                callback(err);
            } else if (numRemoved != 1) {
                callback('unexpected number of requests removed ' + numRemoved);
            } else {
                callback();
            }
        });
    },

    /**
     * Retrieves the next request that is older than the given expiration.
     * @param {Int} expiration The next request older than this number of ticks will be retrieved.
     * @param {Int} maxRetries Requests that have attempted to process this many times will be excluded.
     * @param {Function} callback Will be invoked when the request is retrieved.
     * @param {String|Exception} callback.err Will be truthy if there were errors retrieving the request.
     * @param {Object[]} callback.request The retrieved request, or falsy if there were none.
     */
    getProcessRequest: function (expiration, maxRetries, callback) {
        var self = this;
        var expired = Date.now() - expiration;
        self.db.find({ $and: [{timestamp: { $lt: expired } }, {retries: { $lt: maxRetries } }]}).sort({timestamp:1}).limit(1).exec(function (err, docs) {
            if (err) {
                callback(err);
            } else {
                if (docs.length) {
                    callback(null, docs[0]);
                } else {
                    callback();
                }
            }

        });
    },

    /**
     * Queues a request for processing.
     * @param {object} options Options for the queue request.
     * @param {String} options.method The HTTP request being queued
     * @param {String} options.localFile Full path to the local file being queued
     * @param {String} options.remoteFile Full URL to the remote file
     * @param [String] options.destLocalFile Full path to the local destination file, required for move and copy requests
     * @param [String] options.destRemoteFile Full URL to the remote file, required for move and copy requests
     * @param {function} callback Callback function to call once the request has been queued.
     * @param {String|Exception} callback.err Any error messages that occurred.
     */
    queueRequest: function(options, callback) {
        var reqMethod = options.method;
        var cachedFilePath = options.localFile;
        var remoteFileUrl = options.remoteFile;
        var destCachedFilePath = options.destLocalFile;
        var destRemoteFileUrl = options.destRemoteFile;
        var isFolder = false;
        if (options.isFolder != undefined) {
            isFolder = options.isFolder;
        }

        log.debug("queueRequest: %s: queuing %s method to remote %s", cachedFilePath, reqMethod, remoteFileUrl);

        var self = this;
        var remove = function(removeDoc, removeCallback) {
            log.debug("queueRequest: %s: removing previously queued %s request", cachedFilePath, removeDoc.method);
            self.db.remove({ _id: removeDoc._id }, {}, function(err, numRemoved) {
                if (err) {
                    log.warn("queueRequest: %s: encountered error while attempting removal", cachedFilePath, err);
                    removeCallback(err);
                } else {
                    log.debug("queueRequest: %s: successfully removed previously queued request", cachedFilePath);
                    removeCallback();
                }
            });
        };
        var insert = function(insertReqMethod, insertLocalPath, insertRemoteUrl, insertDestLocalPath, insertDestRemoteUrl, insertCallback) {
            log.debug("queueRequest: %s: preparing to insert " + insertReqMethod + " request", cachedFilePath);

            var insertParentRemoteUrl = utils.getParentPath(insertRemoteUrl);
            var record = {
                method: insertReqMethod,
                localPath: insertLocalPath,
                remoteUrl: insertRemoteUrl,
                timestamp: Date.now(),
                parentRemoteUrl: insertParentRemoteUrl,
                retries: 0,
                isFolder: isFolder
            };
            if (insertDestLocalPath) {
                record['destPath'] = insertDestLocalPath;
                record['destUrl'] = insertDestRemoteUrl;
            }
            self.db.insert(record, function(err, newDoc) {
                if (err) {
                    insertCallback(err);
                } else {
                    insertCallback();
                }
            });
        };

        var processMethod = function(methodToProcess, localPath, remotePath, destLocalPath, destRemotePath, processCallback) {
            self.db.findOne({localPath: localPath}, function(err, doc) {
                if (err) {
                    log.warn("queueRequest: %s: unexpected error while retrieving existing requests", localPath, err);
                    processCallback(err);
                } else {
                    log.debug("queueRequest: %s: finished querying for cached file %s", localPath, localPath);
                    if (doc !== null) {
                        log.debug("queueRequest: %s: already queued for %s", localPath, doc.method);

                        // the file has already been queued. Run through a series of test to determine what should happen
                        if (methodToProcess == "DELETE") {
                            // the file is being deleted. any previously queued actions should be removed.
                            log.debug("queueRequest: %s: queuing for delete. removing previously queued %s", localPath, doc.method);
                            // only queue the deletion if the file isn't newly added
                            remove(doc, function (err) {
                                if (err) {
                                    processCallback(err);
                                } else if (doc.method != "PUT") {
                                    insert(methodToProcess, localPath, remotePath, destLocalPath, destRemotePath, processCallback);
                                } else {
                                    processCallback();
                                }
                            });
                        } else if (doc.method == "PUT" || doc.method == "POST") {
                            // do nothing
                            processCallback();
                        } else if (doc.method == "DELETE") {
                            // file is being re-created
                            log.debug("queueRequest: %s: %s previously queued. changing to POST %s => %s", localPath, doc.method, localPath, remotePath);

                            // change to update instead
                            remove(doc, function (err) {
                                if (err) {
                                    processCallback(err);
                                } else {
                                    insert('POST', localPath, remotePath, destLocalPath, destRemotePath, processCallback);
                                }
                            });
                        } else {
                            log.warn("queueRequest: %s: unhandled method: " + doc.method, localPath);
                            processCallback();
                        }
                    } else {
                        log.debug("queueRequest: %s: queuing originally submitted %s to %s => %s", localPath, methodToProcess, localPath, remotePath);
                        insert(methodToProcess, localPath, remotePath, destLocalPath, destRemotePath, processCallback);
                    }
                }
            });
        }

        if (reqMethod == 'COPY') {
            log.debug("queueRequest: %s: queueing for COPY. processing PUT for destination", cachedFilePath, reqMethod);
            processMethod('PUT', destCachedFilePath, destRemoteFileUrl, null, null, callback);
        } else if (reqMethod == 'MOVE') {
            log.debug("queueRequest: %s: queueing for MOVE. processing DELETE for source", cachedFilePath, reqMethod);

            processMethod('DELETE', cachedFilePath, remoteFileUrl, null, null, function(err) {
                if (err) {
                    callback(err);
                } else {
                    log.debug("queueRequest: %s: queueing for MOVE. processing PUT for destination", cachedFilePath, reqMethod);
                    processMethod('PUT', destCachedFilePath, destRemoteFileUrl, null, null, callback);
                }
            });
        } else {
            processMethod(reqMethod, cachedFilePath, remoteFileUrl, null, null, callback);
        }
    }
};

// export this class
module.exports = RequestQueue;
