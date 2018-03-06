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
var File = require('../../../../lib/spi/file');

var TestFile = function (filePath, tree, data) {
    if (!(this instanceof TestFile)) {
        return new TestFile();
    }

    this.data = data;
    this.dirty = false;

    File.call(this, filePath, tree);
};

util.inherits(TestFile, File);

TestFile.prototype.isFile = function () {
    return this.data.isFile;
};

TestFile.prototype.isDirectory = function () {
    return !this.data.isFile;
};

TestFile.prototype.isReadOnly = function () {
    return this.data.readOnly;
};

TestFile.prototype.setReadOnly = function (readOnly, cb) {
    this.dirty = true;
    this.data.readOnly = readOnly;
    cb();
};

TestFile.prototype.size = function () {
    return this.data.content.length;
};

TestFile.prototype.allocationSize = function () {
    return this.size();
};

TestFile.prototype.lastModified = function () {
    return this.data.lastModified;
};

TestFile.prototype.setLastModified = function (ms) {
    this.dirty = true;
    this.data.lastModified = ms;
};

TestFile.prototype.lastChanged = function () {
    return this.lastModified();
};

TestFile.prototype.created = function () {
    return this.data.created;
};

TestFile.prototype.lastAccessed = function () {
    return this.lastModified();
};

TestFile.prototype.read = function (buffer, offset, length, position, cb) {
    var target = offset;
    var source = position;
    var writtenBuffer = [];
    var written;
    for (written = 0; written < length; written++) {
        if (source >= this.data.content.length) {
            break;
        }
        if (buffer instanceof Buffer) {
            buffer.write(this.data.content[source], target);
        } else {
            buffer[target] = this.data.content[source];
        }
        writtenBuffer.push(this.data.content[source]);
        target++;
        source++;
    }
    cb(null, written, writtenBuffer);
};

TestFile.prototype.write = function (data, position, cb) {
    if (position + data.length > this.data.content.length) {
        cb('unable to write: file is not large enough to receive data');
    } else {
        this.dirty = true;
        if (this.data.content instanceof Array) {
            var target = position;
            for (var i = 0; i < data.length; i++) {
                if (data instanceof Buffer) {
                    this.data.content[target] = data.toString('utf8', i, i+1);
                } else {
                    this.data.content[target] = data[i];
                }
                target++;
            }
        } else {
            var before = '';

            if (position > 0) {
                before = this.data.content.substr(0, position);
            }
            var after = this.data.content.substr(position + data.length);
            if (data instanceof Buffer) {
                this.data.content = before + data.toString('utf8') + after;
            } else {
                this.data.content = before + data + after;
            }
        }
        cb();
    }
};

TestFile.prototype.setLength = function (length, cb) {
    var content = [];
    this.dirty = true;
    for (var i = 0; i < length; i++) {
        var data = '';
        if (this.data.content.length > i) {
            data = this.data.content[i];
        }
        content[i] = data;
    }

    this.data.content = content;
    cb();
};

TestFile.prototype.delete = function (cb) {
    this.dirty = false;
    if (this.isFile()) {
        this.tree.delete(this.getPath(), cb);
    } else {
        this.tree.deleteDirectory(this.getPath(), cb);
    }
};

TestFile.prototype.flush = function (cb) {
    cb();
};

TestFile.prototype.close = function (cb) {
    var self = this;
    if (self.dirty) {
        self.tree.entities.update({_id: self.data._id}, self.data, {}, function (err) {
            if (err) {
                cb(err);
            } else {
                cb();
            }
        });
    } else {
        cb();
    }
};

module.exports = TestFile;
