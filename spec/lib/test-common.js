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

var Datastore = require('nedb');
var events = require('events').EventEmitter;
var Path = require('path');

// force paths to use forward slashes for compatibility
Path.sep = '/';
Path.join2 = Path.join;
Path.join = function () {
  var res = Path.join2.apply({}, arguments);
  return res.replace(/\\/g, Path.sep);
};

function TestCommon() {
  var self = this;
  var pipeDelay = 0;

  self.setPipeDelay = function (delay) {
    self.pipeDelay = delay;
  };

  self.fs = {
    setTestFile: function (filePath, data) {
      if (this.allFiles[filePath] === undefined) {
        var cdate = new Date();
        this.allFiles[filePath] = {
          ctime: cdate,
          mtime: cdate,
          data: data,
          size: data.length,
          isFile: function () {
            return true;
          }, isDirectory: function () {
            return false;
          }
        };
      } else {
        this.allFiles[filePath]['data'] = data;
      }
    },
    setTestFolder: function (folderPath) {
      if (this.allFiles[folderPath] === undefined) {
        var cdate = new Date();
        this.allFiles[folderPath] = {
          ctime: cdate,
          mtime: cdate,
          isFile: function () {
            return false;
          },
          isDirectory: function () {
            return true;
          }
        }
      }
    },
    allFiles: {},
    createReadStream: function (filePath) {
      if (this.allFiles[filePath] === undefined) {
        throw 'unable to create read stream to unknown file ' + filePath;
      }
      var stream = new events();
      stream['path'] = filePath;
      stream['pipe'] = function (other) {
        var pipeStream = new events();
        var emitEnd = function () {
          stream.emit('data', [1, 2, 3, 4, 5]);
          if (!other.aborted) {
            if (other.emit) {
              other.emit('end');
            }
            pipeStream.emit('end');
          }
        };

        if (self.pipeDelay) {
          setTimeout(emitEnd, self.pipeDelay);
        } else {
          emitEnd();
        }

        return pipeStream;
      };
      return stream;
    },
    createWriteStream: function (filePath, cdate) {
      if (cdate === undefined) {
        cdate = new Date();
      }
      this.allFiles[filePath] = {
        ctime: cdate,
        mtime: cdate,
        isFile: function () {
          return true;
        }
      };
      return {path: filePath};
    },
    writeFileSync: function (filePath, data) {
      this.setTestFile(filePath, data);
    },
    statSync: function (filePath) {
      if (this.allFiles[filePath] !== undefined) {
        return this.allFiles[filePath];
      } else {
        throw 'invalid file: ' + filePath;
      }
    },
    closeSync: function (args) {
    },
    openSync: function (args) {
    },
    readFileSync: function (filePath, encoding) {
      if (this.allFiles[filePath] !== undefined) {
        return this.allFiles[filePath].data;
      } else {
        throw 'file at ' + filePath + ' not found';
      }
    },
    unlinkSync: function (filePath) {
      if (this.allFiles[filePath] === undefined) {
        throw 'file to unlink at ' + filePath + ' not found';
      } else {
        this.allFiles[filePath] = undefined;
      }
    },
    readFile: function (filePath, callback) {
      var err = undefined;
      var data = undefined;
      try {
        data = this.readFileSync(filePath);
      } catch (e) {
        err = e;
      }
      callback(err, data);
    },
    writeFile: function (filePath, data, callback) {
      try {
        this.writeFileSync(filePath, data);
        callback();
      } catch (e) {
        callback(e);
      }
    },
    readdir: function (folderPath, callback) {
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
    mkdir: function (dirPath) {
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
