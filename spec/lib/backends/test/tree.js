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

var util = require('util');
var Datastore = require('nedb');
var Path = require('path');

var Tree = require('../../../../lib/spi/tree');
var TestFile = require('./file');
var utils = require('../../../../lib/utils');

var TestTree = function (options) {
  if (!(this instanceof TestTree)) {
    return new TestTree();
  }

  this.entities = new Datastore();
  this.options = options || {};

  Tree.call(this);
};

util.inherits(TestTree, Tree);

TestTree.prototype.printEntities = function () {
    this.entities.find({}, function (err, docs) {
        if (err) {
            console.log(err);
        } else {
            console.log(docs);
        }
    });
};

TestTree.prototype.createFileInstance = function (filePath, content, fileLength, cb) {
    if (typeof(fileLength) == 'function') {
        this.open(filePath, fileLength);
    } else {
        this.open(filePath, cb);
    }
};

TestTree.prototype.isTempFileName = function (name) {
    return false;
};

TestTree.prototype.isTempFileNameForce = function (name) {
    name = utils.getPathName(name);
    if (name) {
        if (name.length > 0) {
            return name[0] == '.';
        }
    }
    return false;
};

TestTree.prototype.addEntity = function (path, options, cb) {
    var self = this;
    var add = function () {
        self.entities.insert(options, function (err, doc) {
            if (err) {
                cb(err);
            } else {
                cb(null, new TestFile(path, self, doc));
            }
        });
    };
    var createParent = function (parent) {
        self.exists(parent, function (err, exists) {
            if (err) {
                cb(err);
            } else if (!exists && parent != '/') {
                self.addDirectory(parent, false, function (err) {
                    if (err) {
                        cb(err);
                    } else {
                        createParent(utils.getParentPath(parent));
                    }
                });
            } else {
                add();
            }
        });
    };
    self.exists(path, function (err, exists) {
        if (err) {
            cb(err);
        } else if (exists) {
            if (options.isFile) {
                cb('entity at path ' + path + ' already exists');
            } else {
                cb();
            }
        } else {
            createParent(utils.getParentPath(path));
        }
    });
};

TestTree.prototype.addFile = function (path, readOnly, content, cb) {
    var currTime = new Date().getTime();
    this.addFileWithDates(path, readOnly, content, currTime, currTime, cb);
};

TestTree.prototype.addFileWithDates = function (path, readOnly, content, created, lastModified, cb) {
    this.addEntity(path, {
        path: utils.getParentPath(path),
        name: utils.getPathName(path),
        isFile: true,
        readOnly: readOnly,
        content: content,
        lastModified: lastModified,
        created: created
    }, cb);
};

TestTree.prototype.addDirectory = function (path, readOnly, cb) {
    var currTime = new Date().getTime();
    this.addEntity(path, {
        path: utils.getParentPath(path),
        name: utils.getPathName(path),
        isFile: false,
        readOnly: readOnly,
        lastModified: currTime,
        created: currTime
    }, cb);
};

TestTree.prototype.exists = function (name, cb) {
    if (name == '/') {
        cb(null, true);
    } else {
        this.entities.findOne({$and: [{path: utils.getParentPath(name)}, {name: utils.getPathName(name)}]}, function (err, doc) {
            if (err) {
                cb(err);
            } else {
                cb(null, (doc != null));
            }
        });
    }
};

TestTree.prototype.open = function (name, cb) {
    var self = this;
    this.entities.findOne({$and: [{path: utils.getParentPath(name)}, {name: utils.getPathName(name)}]}, function (err, doc) {
        if (err) {
            cb(err);
        } else if (!doc) {
            cb('cannot open file at ' + name + '. not found');
        } else {
            cb(null, new TestFile(name, self, doc));
        }
    });
};

TestTree.prototype.list = function (pattern, cb) {
    var self = this;
    var filter;
    if (pattern.charAt(pattern.length - 1) == '*') {
        pattern = pattern.substr(0, pattern.length - 2);
        if (pattern == '') {
            pattern = '/';
        }
        filter = {path: pattern};
    } else {
        filter = {path: utils.getParentPath(pattern), name: utils.getPathName(pattern)};
    }
    self.entities.find(filter, function (err, docs) {
        if (err) {
            cb(err);
        } else {
            var files = [];
            for (var i = 0; i < docs.length; i++) {
                files.push(new TestFile(Path.join(docs[i].path, docs[i].name), self, docs[i]));
            }
            cb(null, files);
        }
    });
};

TestTree.prototype.createFile = function (name, cb) {
    this.addFile(name, false, '', cb);
};

TestTree.prototype.createDirectory = function (name, cb) {
    this.addDirectory(name, false, cb);
};

TestTree.prototype.delete = function (name, cb) {
    var self = this;
    self.exists(name, function (err, exists) {
        if (err) {
            cb(err);
        } else if (!exists) {
            cb('path to delete does not exist ' + name);
        } else {
            var path = utils.getParentPath(name);
            var itemName = utils.getPathName(name);
            self.entities.remove({$and: [{path: path}, {name: itemName}, {isFile: true}]}, {multi:true}, function (err, numRemoved) {
                if (err) {
                    cb(err);
                } else if (numRemoved != 1) {
                    cb('unexpected number of files deleted: ' + numRemoved);
                } else {
                    cb();
                }
            });
        }
    });
};

TestTree.prototype.deleteDirectory = function (name, cb) {
    var self = this;
    self.exists(name, function (err, exists) {
        if (err) {
            cb(err);
        } else if (!exists) {
            cb('path to delete does not exist ' + name);
        } else {
          self.entities.find({path: name}, function (err, docs) {
            if (err) {
              cb(err);
            } else if (docs.length && !self.options.enforceEmptyDirs) {
              cb('directory ' + name + ' is not empty. cannot be deleted');
            } else {
              self.entities.remove({$and: [{path: utils.getParentPath(name)}, {name: utils.getPathName(name)}, {isFile: false}]}, {multi: true}, function (err, numRemoved) {
                if (err) {
                  cb(err);
                } else if (numRemoved != 1) {
                  cb('unexpected number of directories deleted: ' + numRemoved);
                } else {
                  cb();
                }
              });
            }
          });
        }
    });
};

TestTree.prototype.rename = function (oldName, newName, cb) {
    var self = this;

    var doUpdate = function () {
        self.entities.update({$and: [{path: utils.getParentPath(oldName)},
              {name: utils.getPathName(oldName)}]}, {$set: {path: utils.getParentPath(newName), name: utils.getPathName(newName)}},
          {multi: true},
          function (err, numUpdated) {
              if (err) {
                  cb(err);
              } else if (numUpdated != 1) {
                  cb('unexpected number of entities renamed: '  + numUpdated);
              } else {
                  self.entities.update({path: oldName}, {$set: {path: newName}}, {multi:true}, function (err, numUpdated) {
                      if (err) {
                          cb(err);
                      } else {
                          cb();
                      }
                  });
              }
          }
        );
    };

    self.exists(newName, function (err, exists) {
        if (err) {
            cb(err);
        } else if (exists) {
            self.delete(newName, function (err) {
                if (err) {
                    cb(err);
                } else {
                    doUpdate();
                }
            });
        } else {
            doUpdate();
        }
    });
};

TestTree.prototype.disconnect = function (cb) {
    cb();
};

module.exports = TestTree;
