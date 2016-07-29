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

var Datastore = require('nedb');

function TestCommon() {
    var self = this;

    var _info = console.info;
    self.log = {
        trace: function(args) {
            _info.call(console, args);
        },
        debug: function(args) {
            _info.call(console, args);
        },
        info: function(args) {
            _info.call(console, args);
        },
        warn: function(args) {
            _info.call(console, args);
        },
        error: function(args) {
            _info.call(console, args);
        }
    };

    self.fs = {
        setTestFile: function(filePath, data) {
            if (this.allFiles[filePath] === undefined) {
                var cdate = new Date();
                this.allFiles[filePath] = {
                    ctime: cdate,
                    mtime: cdate,
                    data: data,
                    size: data.length,
                    isFile: function() {
                        return true;
                    }, isDirectory: function() {
                        return false;
                    }
                };
            } else {
                this.allFiles[filePath]['data'] = data;
            }
        },
        setTestFolder: function(folderPath) {
            if (this.allFiles[folderPath] === undefined) {
                var cdate = new Date();
                this.allFiles[folderPath] = {
                    ctime: cdate,
                    mtime: cdate,
                    isFile: function() {
                        return false;
                    },
                    isDirectory: function() {
                        return true;
                    }
                }
            }
        },
        allFiles: {
        
        },
        createReadStream: function(filePath) {
            if (this.allFiles[filePath] === undefined) {
                throw 'unable to create read stream to unknown file ' + filePath;
            }
            var stream = new events();
            stream['path'] = filePath;
            stream['pipe'] = function(other) {};
            return stream;
        },
        createWriteStream: function(filePath, cdate) {
            if (cdate === undefined) {
                cdate = new Date();
            }
            this.allFiles[filePath] = {
                ctime: cdate,
                mtime: cdate,
                isFile: function() {
                    return true;
                }
            };
            return {path: filePath};
        },
        writeFileSync: function(filePath, data) {
            this.setTestFile(filePath, data);
        },
        statSync: function(filePath) {
            if (this.allFiles[filePath] !== undefined) {
                return this.allFiles[filePath];
            } else {
                throw "invalid file: " + filePath;
            }
        },
        closeSync: function(args) {
        },
        openSync: function(args) {
        },
        readFileSync: function(filePath, encoding) {
            if (this.allFiles[filePath] !== undefined) {
                return this.allFiles[filePath].data;
            } else {
                throw 'file at ' + filePath + ' not found';
            }
        },
        unlinkSync: function(filePath) {
            if (this.allFiles[filePath] === undefined) {
                throw 'file to unlink at ' + filePath + ' not found';
            } else {
                this.allFiles[filePath] = undefined;
            }
        },
        readFile: function(filePath, callback) {
            var err = undefined;
            var data = undefined;
            try {
                data = this.readFileSync(filePath);
            } catch (e) {
                err = e;
            }
            callback(err, data);
        },
        writeFile: function(filePath, data, callback) {
            try {
                this.writeFileSync(filePath, data);
                callback();
            } catch (e) {
                callback(e);
            }
        },
        readdir: function(folderPath, callback) {
            if (this.allFiles[folderPath] === undefined) {
                callback('unknown folder: ' + folderPath);
            } else {
                var files = [];
                for (var key in this.allFiles) {
                    if (key.length > folderPath.length) {
                        var keyFolder = key.substr(0, key.lastIndexOf('/'));
                        if (keyFolder == folderPath) {
                            files.push(key.substr(key.lastIndexOf('/') + 1));
                        }
                    }
                }
                callback(undefined, files);
            }
        }
    };
        
    self.mkdirpSync = {
        mkdir: function(dirPath) {
        }
    };
    
    self.db = new Datastore();

    spyOn(self.fs, 'createReadStream').andCallThrough();
    spyOn(self.fs, 'createWriteStream').andCallThrough();
    spyOn(self.fs, 'writeFileSync').andCallThrough();
    spyOn(self.fs, 'unlinkSync').andCallThrough();
    spyOn(self.fs, 'statSync').andCallThrough();
    spyOn(self.mkdirpSync, 'mkdir').andCallThrough();
    spyOn(self.db, 'find').andCallThrough();
}

module.exports = TestCommon;
