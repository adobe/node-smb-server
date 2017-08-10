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

var events = require('events');
var EventEmitter = events.EventEmitter;
var Datastore = require('nedb');
var async = require('async');
var util = require('util');

var utils = require('../../lib/utils');
var TestStream = require('./test-stream');

function TestFS() {
  this.clearAll();
  this.allowDirDelete = false;

  EventEmitter.call(this);
}

util.inherits(TestFS, EventEmitter);

function _findByPath(path, cb) {
  path = _trimSlash(path);
  var dir = utils.getParentPath(path);
  var name = utils.getPathName(path);
  this.allFiles.find({path: dir, name: name}, function (err, docs) {
    if (err) {
      cb(err);
    } else if (docs.length > 1) {
      cb('duplicate file encountered ' + path);
    } else {
      cb(null, docs.length > 0 ? docs[0] : false, dir, name);
    }
  });
}

function _findByPathSync(path) {
  var self = this;
  var sync = true;
  var syncErr = null;
  var data = null;
  _findByPath.call(self, path, function(err, file) {
    syncErr = err;
    data = file;
    sync = false;
  });
  while(sync) {require('deasync').sleep(100);}

  if (syncErr) {
    throw syncErr;
  } else if (!data) {
    throw path + ' not found';
  }

  return data;
}

function _findById(id, cb) {
  this.allFiles.find({_id: id}, function (err, docs) {
    if (err) {
      cb(err);
    } else if (docs.length ==0 ) {
      cb('cannot find file with id ' + id);
    } else {
      cb(null, docs[0]);
    }
  });
}

function _extendDoc(doc) {
  var self = this;
  doc['isDirectory'] = function () {
    return doc.isdir;
  };
  doc['isFile'] = function () {
    return !doc.isdir;
  };
  Object.defineProperty(doc, 'mtime', {
    get: function() {
      return this._mtime;
    },
    set: function (modified) {
      this._mtime = modified;
      _updateByIdSync.call(self, this._id, {_mtime: modified, ctime: modified}, false);
    }
  });
}

function _updateByFilter(filter, updateData, newCreated, cb) {
  var self = this;

  setTimeout(function () { // pause to ensure dates change
    var date = new Date();
    if (!updateData['_mtime']) {
      updateData['_mtime'] = date;
      updateData['ctime'] = date;
    }
    updateData['atime'] = date;

    if (newCreated) {
      updateData['birthtime'] = date;
    }

    self.allFiles.update(filter, {$set: updateData}, {}, cb);
  }, 5);
}

function _updateByName(name, updateData, newCreated, cb) {
  var dir = utils.getParentPath(name);
  var name = utils.getPathName(name);
  _updateByFilter.call(this, {path: dir, name: name}, updateData, newCreated, cb);
}

function _updateById(id, updateData, newCreated, cb) {
  _updateByFilter.call(this, {_id: id}, updateData, newCreated, cb);
}

function _updateByIdSync(id, updateData, newCreated) {
  var self = this;
  var sync = true;
  var syncErr = null;
  _updateById.call(self, id, updateData, newCreated, function(err) {
    syncErr = err;
    sync = false;
  });
  while(sync) {require('deasync').sleep(100);}

  if (syncErr) {
    throw syncErr;
  }

  return false;
}

function _trimSlash(path) {
  if (path.charAt(path.length - 1) == '/') {
    path = path.substr(0, path.length - 1);
  }
  return path;
}

TestFS.prototype.allowDeleteNonEmptyDir = function (allow) {
  this.allowDirDelete = allow ? true : false;
};

TestFS.prototype.printAll = function (cb) {
  this.allFiles.find({}, function (err, docs) {
    console.log(docs);
    if (cb) {
      cb();
    }
  });
};

TestFS.prototype.mkdirp = function (path, cb) {
  var self = this;
  var paths = path.toString().split('/');
  var parent = '/';
  async.eachSeries(paths, function (currPath, eachCb) {
    if (currPath) {
      self.createEntityIfNoExist(parent + currPath, true, function (err) {
        parent += currPath + '/';
        eachCb(err);
      });
    } else {
      eachCb();
    }
  }, function (err) {
    cb(err);
  });
};

TestFS.prototype.createEntityIfNoExist = function (path, isDir, cb) {
  var self = this;
  _findByPath.call(self, path, function (err, file) {
    if (err) {
      cb(err);
    } else if (!file) {
      self.createEntity(path, isDir, function (err) {
        cb(err);
      });
    } else {
      cb();
    }
  });
};

TestFS.prototype.createEntityWithDates = function (path, isDir, content, created, lastModified, cb) {
  var self = this;
  var dir = '';
  var name = path;
  if (path != '/') {
    dir = utils.getParentPath(path);
    name = utils.getPathName(path);
  }
  var size = content ? content.length : 0;

  self.mkdirp(dir, function (err) {
    if (err) {
      cb(err);
    } else {
      var entity = {
        path: dir,
        name: name,
        mode: 33188,
        size: 0,
        blocks: 1,
        blksize: 0,
        birthtime: created,
        _mtime: lastModified,
        atime: lastModified,
        ctime: lastModified,
        isdir: isDir
      };

      if (!isDir) {
        entity['data'] = content;
        entity.size = size;
        entity.blksize = size;
      }
      self.allFiles.insert(entity, function (err, doc) {
        if (err) {
          cb(err);
        } else {
          cb(null, doc._id);
        }
      });
    }
  });
};

TestFS.prototype.createEntity = function (path, isDir, cb) {
  var date = new Date();
  this.createEntityWithDates(path, isDir, '', date, date, cb);
};

TestFS.prototype.open = function (path, mode, cb) {
  var self = this;

  _findByPath.call(self, path, function (err, file, dir, name) {
    if (err) {
      cb(err);
    } else {
      if (mode.indexOf('r') >= 0) {
        if (!file) {
          cb('file opened for reading does not exist: ' + path);
        } else {
          cb(null, file._id);
        }
      } else if (mode.indexOf('w') >= 0) {
        if (mode.indexOf('x') >= 0 && file) {
          cb('file opened for writing already exists ' + path);
        } else if (file) {
          cb(null, file._id);
        } else {
          self.createEntity(path, false, cb);
        }
      } else {
        cb('unsupported open mode ' + mode);
      }
    }
  });
};

TestFS.prototype.close = function (fd, cb) {
  cb();
};

TestFS.prototype.clearAll = function () {
  this.allFiles = new Datastore();
  this.pipeDelay = 0;
};

TestFS.prototype.setPipeDelay = function (delay) {
  this.pipeDelay = delay;
};

TestFS.prototype.createReadStream = function (filePath) {
  var self = this;

  var file = _findByPathSync.call(this, filePath);
  var stream = new TestStream(filePath);
  stream.setPipeDelay(self.pipeDelay);

  stream.setReadStream(function (readCb) {
    var buff = new Array(file.size);
    self.read(file._id, buff, 0, file.size, 0, function (err) {
      if (err) {
        readCb(err);
      } else {
        var data = buff.join('');
        readCb(null, data);
      }
    });
  });

  return stream;
};

TestFS.prototype.createWriteStream = function (filePath) {
  var self = this;
  var stream = new events();
  stream.path = filePath;
  stream.data = '';

  stream.write = function (chunk, encoding, callback) {
    stream.data += chunk;
    if (callback) {
      callback();
    }
  };

  stream.end = function (chunk, encoding, callback) {
    function _finishStream(err) {
      if (err) {
        stream.emit('error', err);
      } else {
        stream.emit('finish');
      }
      if (callback) {
        callback(err);
      }
    }

    stream.data += chunk;
    self.open(filePath, 'wx', function (err, fd) {
      if (err) {
        _finishStream(err);
      } else if (stream.data.length > 0) {
        self.truncate(filePath, stream.data.length, function (err) {
          if (err) {
            _finishStream(err);
          } else {
            self.write(fd, stream.data, 0, stream.data.length, 0, function (err) {
              _finishStream(err);
            });
          }
        });
      } else {
        _finishStream();
      }
    });
  };

  return stream;
};

TestFS.prototype.writeFileSync = function (filePath, data) {
  this.setTestFile(filePath, data);
};

TestFS.prototype.statSync = function (filePath) {
  var self = this;
  var sync = true;
  var data = null;
  var syncErr = null;
  self.stat(filePath, function(err, stat) {
    data = stat;
    syncErr = err;
    sync = false;
  });
  while(sync) {require('deasync').sleep(100);}

  if (syncErr) {
    throw syncErr;
  }

  return data;
};

TestFS.prototype.stat = function (filePath, cb) {
  var self = this;
  _findByPath.call(self, filePath, function (err, file) {
    if (err) {
      cb(err);
    } else if (!file) {
      cb({code: 'ENOENT', message: 'file to stat not found ' + filePath});
    } else {
      _extendDoc.call(self, file);
      cb(null, file);
    }
  });
};

TestFS.prototype.truncate = function (path, length, cb) {
  var self = this;
  var dir = utils.getParentPath(path);
  var name = utils.getPathName(path);

  _updateByName.call(self, path, {size: length, blksize: length}, false, function (err) {
    if (err) {
      cb(err);
    } else {
      cb();
    }
  });
};

TestFS.prototype.write = function (fd, data, offset, length, position, cb) {
  var self = this;

  _findById.call(self, fd, function (err, file) {
    if (err) {
      cb(err);
    } else {
      length = position + length > file.size ? file.size - position : length;
      var currValue = file.data;
      var before = '';
      var after = '';
      if (currValue.length > position) {
        before = currValue.substr(0, position);
      }
      if (currValue.length > position + length) {
        after = currValue.substr(position + length);
      }

      var written = '';
      for (var i = offset; i < offset + length; i++) {
        var b;
        if (data instanceof Buffer) {
          b = data.toString('utf8', i, i + 1);
        } else {
          b = data[i];
        }
        written += b;
      }
      _updateById.call(self, fd, {data: before + written + after}, false, function (err) {
        if (err) {
          cb(err);
        } else {
          cb(null, length, written);
        }
      });
    }
  });
};

TestFS.prototype.read = function (fd, buffer, offset, length, position, cb) {
  var self = this;
  _findById.call(self, fd, function (err, file) {
    if (err) {
      cb(err);
    } else {
      var data = file.data;
      var lastIndex = position + length;
      if (lastIndex >= data.length) {
        lastIndex = data.length;
      };
      var totalToRead = lastIndex - position;
      var retBuff = new Buffer(totalToRead);
      var currRead = 0;
      for (var i = position; i < lastIndex; i++) {
        var targetIndex = offset + currRead;
        if (buffer instanceof Buffer) {
          buffer.write(data[i], targetIndex);
        } else {
          buffer[targetIndex] = data[i];
        }
        retBuff.write(data[i], currRead);
        currRead++;
      }
      cb(null, totalToRead, retBuff);
    }
  });
};

TestFS.prototype.unlinkSync = function (path) {
  var self = this;
  var sync = true;
  var syncErr = null;
  self.unlink(path, function(err) {
    syncErr = err;
    sync = false;
  });
  while(sync) {require('deasync').sleep(100);}

  if (syncErr) {
    throw syncErr;
  }

  return true;
};

TestFS.prototype.unlink = function (path, cb) {
  var dir = utils.getParentPath(path);
  var name = utils.getPathName(path);
  this.allFiles.remove({path: dir, name: name}, {}, function (err, numRemoved) {
    if (err) {
      cb(err);
    } else if (numRemoved != 1) {
      cb('unexpected number of entries removed when unlinking ' + path + ': ' + numRemoved);
    } else {
      cb();
    }
  });
};

TestFS.prototype.readFile = function (filePath, callback) {
  var err = undefined;
  var data = undefined;
  try {
    data = this.readFileSync(filePath);
  } catch (e) {
    err = e;
  }
  callback(err, data);
};

TestFS.prototype.writeFile = function (filePath, data, callback) {
  try {
    this.writeFileSync(filePath, data);
    callback();
  } catch (e) {
    callback(e);
  }
};

TestFS.prototype.readdir = function (folderPath, callback) {
  folderPath = _trimSlash(folderPath);
  this.allFiles.find({path: folderPath}, function (err, docs) {
    if (err) {
      callback(err);
    } else {
      var names = [];
      for (var i = 0; i < docs.length; i++) {
        names.push(docs[i].name);
      }
      callback(null, names);
    }
  });
};

TestFS.prototype.rmdir = function (path ,cb) {
  var self = this;
  var dir = utils.getParentPath(path);
  var name = utils.getPathName(path);

  self.readdir(path, function (err, files) {
    if (err) {
      cb(err);
    } else if (files.length && !self.allowDirDelete) {
      cb('directory to remove is not empty: ' + path);
    } else {
      self.allFiles.remove({path: dir, name: name, isdir: true}, {}, function (err, numRemoved) {
        if (numRemoved != 1) {
          cb('directory to remove was not found: ' + path)
        } else {
          cb();
        }
      });
    }
  });
};

TestFS.prototype.rename = function (oldName, newName, cb) {
  var self = this;
  var newDir = utils.getParentPath(newName);
  var newPathName = utils.getPathName(newName);

  // remove target file if needed
  self.allFiles.remove({path: newDir, name: newPathName}, {}, function (err) {
    if (err) {
      cb(err);
    } else {
      var newDate = new Date();
      _updateByName.call(self, oldName, {path: newDir, name: newPathName}, true, function (err, numUpdated) {
        if (err) {
          cb(err);
        } else if (numUpdated != 1) {
          cb('unexpected number of items renamed from ' + oldName + ' to ' + newName + ': ' + numUpdated);
        } else {
          var regex = new RegExp('^' + oldName.replace('/', '\\/'), "g");
          self.allFiles.find({path: regex}, function (err, docs) {
            async.each(docs, function (doc, eachCb) {
              var doReplace = false;
              if (doc.path == oldName) {
                doReplace = newName;
              } else if (doc.path.length > oldName.length) {
                if (doc.path.substr(0, oldName.length + 1) == oldName + '/') {
                  doReplace = newName + doc.path.substr(oldName.length);
                }
              }
              if (doReplace) {
                self.allFiles.update({_id: doc._id}, {$set: {path: doReplace}}, {}, function (err) {
                  eachCb(err);
                });
              } else {
                eachCb();
              }
            }, function (err) {
              cb(err);
            });
          });
        }
      });
    }
  });
};

TestFS.prototype.chmod = function (path, mode, cb) {
  cb();
};

TestFS.prototype.fsync = function (fd, cb) {
  cb();
};

module.exports = TestFS;
