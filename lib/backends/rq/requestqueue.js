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
}

RequestQueue.prototype = {

    /**
     * Retrieves all requests that have been queued for a given parent directory.
     * @param {string} path The full to the directory to check.
     * @param {callback} callback Function to call with results of get operation.
     * @param {String|Exception} callback.err Error that occurred (will be undefined on success)
     * @param {Object} callback.requestLookup object whose keys are names and values are methods
     */
    getRequests: function(path, callback) {
        var self = this;
        self.db.find({path: path}, function (err, docs) {
            if (err) {
                log.warn("unexpected error while attempting to query request queue: " + err);
                callback(err);
            } else {
                log.debug("getCreateRequests: query for path %s returned %s records", path, docs.length);

                var requestLookup = {};
                for (var i = 0; i < docs.length; i++) {
                    requestLookup[docs[i].name] = docs[i].method;
                }

                callback(undefined, requestLookup);
            }
        });
    },

    /**
     * Increments the number of retry counts for a given request by 1.
     * @param {String} path The path of the request to be updated.
     * @param {String} name The name of the file whose request should be updated.
     * @param {Int} retries The number of retries that will be set for the matching request.
     * @param {Function} callback Will be called after the update.
     * @param {String|Exception} callback.err Will be truthy if there were errors during the update.
     */
    setRetryCount: function (path, name, retries, callback) {
        this.db.update({$and: [{path: path},{name: name}]}, {$set: {retries: retries}}, function (err, numAffected) {
            if (err) {
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
     * @param {String} path The path of the request to be removed.
     * @param {String} name The name of the file whose request should be removed.
     * @param {Function} callback Function that will be called when removal is complete.
     * @param {String|Exception} callback.err If non-null, indicates that an error occurred.
     */
    removeRequest: function (path, name, callback) {
        this.db.remove({path: path, name: name}, {}, function (err, numRemoved) {
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

    getFindPathFilter: function (path) {
        var subReg = new RegExp("^" + path + "\\/", "g");
        return {$or: [{path: path}, {path: subReg} ] };
    },

    getNewPath: function (currPath, oldPath, newPath) {
        var docPath = currPath;
        docPath = docPath.substr(oldPath.length);
        docPath = newPath + docPath;
        return docPath;
    },

    /**
     * Updates the records with a matching path to have a different path value.
     * @param {String} oldPath The path whose records should be updated.
     * @param {String} newPath The new value to set for matching records.
     * @param {Function} callback Will be invoked upon completion.
     * @param {String|Exception} callback.err Will be truthy if there was an error while updating.
     */
    updatePath: function (oldPath, newPath, callback) {
        var self = this;
        self.db.find(self.getFindPathFilter(oldPath), function (err, docs) {
            if (err) {
                callback(err);
            } else {
                var updateDoc = function (index) {
                    if (index < docs.length) {
                        self.db.update({_id: docs[index]._id}, {$set: { path: self.getNewPath(docs[index].path, oldPath, newPath) } }, function (err, numAffected) {
                            if (err) {
                                callback(err);
                            } else {
                                updateDoc(index + 1);
                            }
                        });
                    } else {
                        callback();
                    }
                };
                updateDoc(0);
            }
        });
    },

    /**
     * Removes all records whose path matches a given value.
     * @param {String} path The path whose records should be removed.
     * @param {Function} callback Will be invoked upon completion.
     * @param {String|Exception} callback.err Will be truthy if there was an error while updating.
     */
    removePath: function (path, callback) {
        var self = this;
        this.db.remove(self.getFindPathFilter(path), { multi:true }, function (err, numAffected) {
            if (err) {
                callback(err);
            } else {
                callback();
            }
        });
    },

    /**
     * Copies all records with a given path and assigns them a new path.
     * @param {String} oldPath The path whose records should be copied.
     * @param {String} newPath The path that copied records should receive.
     * @param {Function} callback Will be invoked upon completion.
     * @param {String|Exception} callback.err Will be truthy if there was an error while updating.
     */
    copyPath: function (oldPath, newPath, callback) {
        var self = this;
        self.db.find(self.getFindPathFilter(oldPath), function (err, docs) {
            if (err) {
                callback(err);
            } else {
                var doInsert = function (insertIndex) {
                    if (insertIndex < docs.length) {
                        var doc = docs[insertIndex];
                        self.queueRequest({
                            method: doc.method,
                            path: self.getNewPath(doc.path, oldPath, newPath) + '/' + doc.name,
                            localPrefix: doc.localPrefix,
                            remotePrefix: doc.remotePrefix
                        }, function (err) {
                            if (err) {
                                callback(err);
                            } else {
                                doInsert(insertIndex + 1);
                            }
                        });
                    } else {
                        callback();
                    }
                };
                doInsert(0);
            }
        });
    },

    /**
     * Queues a request for processing.
     * @param {object} options Options for the queue request.
     * @param {String} options.method The HTTP request being queued
     * @param {String} options.path The path to the file to be queued. This path should be the portion of the file's
     *  path that is common between its local location and remote location.
     * @param {String} options.localPrefix Path prefix for the local location of the file. Concatenating this value
     *  with path should yield the full path to the local file.
     * @param {String} options.remotePrefix URL prefix for the remote target of the request. Concatenating this value
     *  with path should yield the full URL to the file.
     * @param [String] options.destPath Optional destination path for move and copy requests. Should be the portion of
     *  the file's path that is common between its local location and remote location.
     * @param {function} callback Callback function to call once the request has been queued.
     * @param {String|Exception} callback.err Any error messages that occurred.
     */
    queueRequest: function(options, callback) {
        var reqMethod = options.method;
        var fullPath = options.path;
        var path = utils.getParentPath(fullPath);
        var name = utils.getPathName(fullPath);
        var localPrefix = options.localPrefix;
        var remotePrefix = options.remotePrefix;
        var destPath = null;
        var destName = null;

        if (options.destPath) {
            destPath = utils.getParentPath(options.destPath);
            destName = utils.getPathName(options.destPath);
        }

        log.debug("queueRequest: %s: queuing %s method", fullPath, reqMethod);

        var self = this;
        var remove = function(removeDoc, removeCallback) {
            log.debug("queueRequest: %s: removing previously queued %s request", fullPath, removeDoc.method);
            self.db.remove({ _id: removeDoc._id }, {}, function(err, numRemoved) {
                if (err) {
                    log.warn("queueRequest: %s: encountered error while attempting removal", fullPath, err);
                    removeCallback(err);
                } else {
                    log.debug("queueRequest: %s: successfully removed previously queued request", fullPath);
                    removeCallback();
                }
            });
        };
        var insert = function(insertReqMethod, insertPath, insertName, insertDestPath, insertDestName, insertCallback) {
            log.debug("queueRequest: %s: preparing to insert " + insertReqMethod + " request", fullPath);

            var record = {
                method: insertReqMethod,
                timestamp: Date.now(),
                retries: 0,
                path: insertPath,
                name: insertName,
                localPrefix: localPrefix,
                remotePrefix: remotePrefix
            };

            if (insertDestPath) {
                record['destPath'] = insertDestPath;
                record['destName'] = insertDestName;
            }

            self.db.insert(record, function (err, newDoc) {
                if (err) {
                    insertCallback(err);
                } else {
                    insertCallback();
                }
            });
        };

        var processMethod = function(methodToProcess, processPath, processName, processDestPath, processDestName,
                                     processCallback) {
            self.db.findOne({$and: [{path: processPath, name: processName}]}, function (err, doc) {
                if (err) {
                    log.warn("queueRequest: %s: unexpected error while retrieving existing requests", fullPath, err);
                    processCallback(err);
                } else {
                    log.debug("queueRequest: %s: finished querying for cached file %s", fullPath, processPath);
                    if (doc !== null) {
                        log.debug("queueRequest: %s: already queued for %s", fullPath, doc.method);

                        // the file has already been queued. Run through a series of test to determine what should happen
                        if (methodToProcess == "DELETE") {
                            // the file is being deleted. any previously queued actions should be removed.
                            log.debug("queueRequest: %s: queuing for delete. removing previously queued %s", fullPath, doc.method);
                            // only queue the deletion if the file isn't newly added
                            remove(doc, function (err) {
                                if (err) {
                                    processCallback(err);
                                } else if (doc.method != "PUT") {
                                    insert(methodToProcess, processPath, processName, processDestPath, processDestName, processCallback);
                                } else {
                                    processCallback();
                                }
                            });
                        } else if (doc.method == "PUT" || doc.method == "POST") {
                            // do nothing
                            processCallback();
                        } else if (doc.method == "DELETE") {
                            // file is being re-created
                            log.debug("queueRequest: %s: %s previously queued. changing to POST %s", fullPath, doc.method, processPath);

                            // change to update instead
                            remove(doc, function (err) {
                                if (err) {
                                    processCallback(err);
                                } else {
                                    insert('POST', processPath, processName, processDestPath, processDestName, processCallback);
                                }
                            });
                        } else {
                            log.warn("queueRequest: %s: unhandled method: " + doc.method, fullPath);
                            processCallback();
                        }
                    } else {
                        log.debug("queueRequest: %s: queuing originally submitted %s to %s", fullPath, methodToProcess, processPath);
                        insert(methodToProcess, processPath, processName, processDestPath, processDestName, processCallback);
                    }
                }
            });
        };

        if (reqMethod == 'COPY') {
            log.debug("queueRequest: %s: queueing for COPY. processing PUT for destination", fullPath, reqMethod);
            processMethod('PUT', destPath, destName, null, null, callback);
        } else if (reqMethod == 'MOVE') {
            log.debug("queueRequest: %s: queueing for MOVE. processing DELETE for source", fullPath, reqMethod);

            processMethod('DELETE', path, name, null, null, function(err) {
                if (err) {
                    callback(err);
                } else {
                    log.debug("queueRequest: %s: queueing for MOVE. processing PUT for destination", fullPath, reqMethod);
                    processMethod('PUT', destPath, destName, null, null, callback);
                }
            });
        } else {
            processMethod(reqMethod, path, name, destPath, destName, callback);
        }
    }
};

// export this class
module.exports = RequestQueue;
