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

var Tree = require('../../spi/tree');
var utils = require('../../utils');

var RQWorkTree = function (share, rqTree, localTree) {
    if (!(this instanceof RQWorkTree)) {
        return new RQWorkTree(share, rqTree, localTree);
    }
    this.rqTree = rqTree;
    this.localTree = localTree;
    Tree.call(this, share);
};

util.inherits(RQWorkTree, Tree);

/**
 * Create a new file.
 *
 * @param {String} path file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
RQWorkTree.prototype.createFile = function (path, cb) {
    var self = this;
    if (!self.rqTree.isTempFileName(path)) {
        self.localTree.createFile(path, function (err, file) {
            if (err) {
                cb(err);
            } else {
                self.localTree.createFile(self.rqTree.getCreateFileName(path), function (err, createFile) {
                    if (err) {
                        cb(err);
                    } else {
                        cb(null, file);
                    }
                });
            }
        });
    } else {
        cb();
    }
};

/**
 * Creates work files for a file that is pre-existing.
 * @param {string} path file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created file
 */
RQWorkTree.prototype.createFileExisting = function (path, cb) {
    if (!this.rqTree.isTempFileName(path)) {
        this.localTree.createFile(path, cb);
    } else {
        cb();
    }
};

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.rename = function (oldName, newName, cb) {
    var self = this;
    if (self.rqTree.isTempFileName(oldName) && self.rqTree.isTempFileName(newName)) {
        // temp file rename, do nothing
        cb();
    } else if (self.rqTree.isTempFileName(oldName) && !self.rqTree.isTempFileName(newName)) {
        self.createFile(newName, function (err) {
            cb(err);
        });
    } else if (self.rqTree.isTempFileName(newName) && !self.rqTree.isTempFileName(oldName)) {
        self.delete(oldName, cb);
    } else {
        var oldCreateName = self.rqTree.getCreateFileName(oldName);
        var newCreateName = self.rqTree.getCreateFileName(newName);
        self.localTree.exists(oldCreateName, function (err, exists) {
            if (err) {
                cb(err);
            } else {
                self.localTree.rename(oldName, newName, function (err) {
                    if (err) {
                        cb(err);
                    } else if (exists) {
                        self.localTree.rename(oldCreateName, newCreateName, cb);
                    } else {
                        self.localTree.createFile(newCreateName, function (err, file) {
                            if (err) {
                                cb(err);
                            } else {
                                cb();
                            }
                        });
                    }
                });
            }
        });
    }
};

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
RQWorkTree.prototype.exists = function (name, cb) {
    this.localTree.exists(name, cb);
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
RQWorkTree.prototype.open = function (name, cb) {
    this.localTree.open(name, cb);
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
RQWorkTree.prototype.list = function (pattern, cb) {
    this.localTree.list(pattern, function (err, files) {
        var result = [];
        for (var i = 0; i < files.length; i++) {
            if (utils.getFileExtension(files[i].getName()) != 'rqcf') {
                result.push(files[i]);
            }
        }
        cb(null, result);
    });
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file created directory
 */
RQWorkTree.prototype.createDirectory = function (name, cb) {
    this.localTree.createDirectory(name, cb);
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.delete = function (name, cb) {
    logger.debug('[rq-work] delete %s', name);
    var self = this;
    if (self.rqTree.isTempFileName(name)) {
        logger.debug('[rq-work] delete ignoring temp file %s', name);
        // ignore temp files
        cb();
    } else {
        var createdName = self.rqTree.getCreateFileName(name);
        self.localTree.exists(createdName, function (err, exists) {
            if (err) {
                cb(err);
            } else if (exists) {
                logger.debug('[rq-work] delete removing create file %s', createdName);
                self.localTree.delete(createdName, function (err) {
                    if (err) {
                        cb(err);
                    } else {
                        logger.debug('[rq-work] delete removing file %s', name);
                        self.localTree.delete(name, cb);
                    }
                });
            } else {
                logger.debug('[rq-work] delete removing file %s', name);
                self.localTree.delete(name, cb);
            }
        });
    }
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.deleteDirectory = function (name, cb) {
    this.localTree.deleteDirectory(name, cb);
};

/**
 * Refresh a specific folder.
 *
 * @param {String} folderPath
 * @param {Boolean} deep
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.refresh = function (folderPath, deep, cb) {
    this.localTree.refresh(folderPath, deep, cb);
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQWorkTree.prototype.disconnect = function (cb) {
    this.localTree.disconnect(cb);
};

module.exports = RQWorkTree;
