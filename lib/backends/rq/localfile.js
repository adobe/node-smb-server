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

var File = require('../../spi/file');

/**
 * Creates an instance of RQLocalFile.
 *
 * @constructor
 * @private
 * @this {RQLocalFile}
 * @param {String} filePath normalized file path
 * @param {File} sourceFile The wrapped file that the work file will use as its underlying file.
 * @param {RQLocalTree} tree tree object
 */
var RQLocalFile = function (source, cacheData, tree) {
  logger.debug('[rq] RQLocalFile.construct %s', source.getPath());

  if (!(this instanceof RQLocalFile)) {
    return new RQLocalFile(source, cacheData, tree);
  }

  this.source = source;
  this.data = cacheData || {};
  this.dirty = source.dirty ? true : false;
  this.cacheInfoOnly = tree.isCacheInfoOnly();

  if (!this.data.local) {
    this.data['local'] = {};
  }

  if (!this.data.remote) {
    this.data['remote'] = {};
  }

  File.call(this, source.getPath(), tree);
};

// the RQWorkFile prototype inherits from File
util.inherits(RQLocalFile, File);

module.exports = RQLocalFile;

/**
 * Reads the contents of a cache info file and converts them to an object.
 * @param {File} infoFile The file to be read.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @param {object} cb.cacheInfo Object containing the read cache information.
 */
RQLocalFile.readCacheInfo = function (infoFile, cb) {
  var buffer = new Buffer(infoFile.size());
  infoFile.read(buffer, 0, infoFile.size(), 0, function (err) {
    if (err) {
      cb(err);
    } else {
      var cacheInfo = {};
      try {
        cacheInfo = JSON.parse(buffer.toString('utf8', 0, infoFile.size()));
        logger.debug('%s read work file contents', infoFile.getPath());
      } catch (e) {
        logger.warn('trying to read work file whose contents are not json %s', infoFile.getPath(), e);
      }
      infoFile.close(function (err) {
        if (err) {
          logger.warn('unable to close work file %s', infoFile.getPath(), err);
        }
        cb(null, cacheInfo);
      });
    }
  });

};

/**
 * Creates a new instance of an RQLocalFile from required information.
 * @param {File} sourceFile The source file whose information will be used for much of the local file's functionality.
 * @param {File} infoFile A file that will be read and whose contents will be used to provide certain info about the
 *  local file.
 * @param {Tree} tree The tree to which the local file belongs.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @param {RQLocalFile} cb.file Will be the new file instance.
 */
RQLocalFile.createInstance = function (sourceFile, infoFile, tree, cb) {
  if (infoFile) {
    // only try to read cache info file if there is one.
    RQLocalFile.readCacheInfo(infoFile, function (err, cacheInfo) {
      if (err) {
        cb(err);
      } else {
        cb(null, new RQLocalFile(sourceFile, cacheInfo, tree));
      }
    });
  } else {
    cb(null, new RQLocalFile(sourceFile, {}, tree));
  }
};

/**
 * Uses local and remote File information to create an object containing cache information in the expected format.
 * @param {File} local The local File whose information will be used as the local info.
 * @param {File} remote The remote File whose information will be used as remote info.
 * @param {boolean} created A flag indicating whether or not the file was created locally.
 * @param [boolean] refreshed A flag indicating whether or not the cache info file was created due to a refresh.
 * @returns {object} Cache information based on the provided objects.
 */
RQLocalFile.getCacheInfo = function (local, remote, created, refreshed) {
  var writeData = {
    local: {
      lastModified: local.lastModified()
    },
    created: created ? true : false,
    refreshed: refreshed ? true : false,
    synced: new Date().getTime()
  };

  if (remote) {
    writeData['remote'] = {
      lastModified: remote.lastModified(),
      created: remote.created()
    };
  }

  return writeData;
};

/**
 * Returns a value indicating whether the local file has been created locally.
 * @return {boolean} TRUE if the file is created locally, otherwise FALSE.
 */
RQLocalFile.prototype.isCreatedLocally = function () {
  return this.data.created ? true : false;
};

/**
 * Retrieves the modified date of the remote file that was downloaded locally.
 * @return {int} A timestamp.
 */
RQLocalFile.prototype.getDownloadedRemoteModifiedDate = function () {
  var modified = this.data.remote.lastModified;
  return modified ? modified : 0;
};

/**
 * Retrieves the date that the local file was last synced.
 * @return {int} A timestamp.
 */
RQLocalFile.prototype.getLastSyncDate = function () {
  return this.data.synced ? this.data.synced : 0;
};

/**
 * Determines if the local file can be safely deleted.
 * @param {function} cb Will be invoked when the operation is complete.
 * @param {Error} cb.err Will be truthy if there were errors during the operation.
 * @param {boolean} cb.canDelete Will be TRUE if the file can be deleted, otherwise FALSE.
 */
RQLocalFile.prototype.canDelete = function (cb) {
  var self = this;
  var path = self.getPath();
  if (self.isDirectory()) {
    logger.debug('%s is a directory, so it can be deleted', path);
    // the file is a directory
    cb(null, true);
  } else if (self.tree.isTempFileName(path)) {
    logger.debug('%s is a temp file, so it can be deleted', path);
    cb(null, true);
  } else {
    var lastModifiedAtCache = self.data.local.lastModified ? self.data.local.lastModified : 0;

    logger.debug('%s is a file, checking lastModified(%d)==lastModifiedAtCache(%d), not isCreatedLocally(%s), and has a downloadedRemoteModifiedDate(%d)', path, self.lastModified(), lastModifiedAtCache, self.isCreatedLocally(), self.getDownloadedRemoteModifiedDate());

    var hasRemoteModified = self.getDownloadedRemoteModifiedDate() ? true : false;
    cb(null, self.source.lastModified() == lastModifiedAtCache && !self.isCreatedLocally() && hasRemoteModified);
  }
};

/**
 * Return a flag indicating whether this is a file.
 *
 * @return {Boolean} <code>true</code> if this is a file;
 *         <code>false</code> otherwise
 */
RQLocalFile.prototype.isFile = function () {
  return this.source.isFile();
};

/**
 * Return a flag indicating whether this is a directory.
 *
 * @return {Boolean} <code>true</code> if this is a directory;
 *         <code>false</code> otherwise
 */
RQLocalFile.prototype.isDirectory = function () {
  return this.source.isDirectory();
};

/**
 * Return a flag indicating whether this file is read-only.
 *
 * @return {Boolean} <code>true</code> if this file is read-only;
 *         <code>false</code> otherwise
 */
RQLocalFile.prototype.isReadOnly = function () {
  return this.source.isReadOnly();
};

/**
 * Return the file size.
 *
 * @return {Number} file size, in bytes
 */
RQLocalFile.prototype.size = function () {
  return this.source.size();
};

/**
 * Return the number of bytes that are allocated to the file.
 *
 * @return {Number} allocation size, in bytes
 */
RQLocalFile.prototype.allocationSize = function () {
  return this.source.allocationSize();
};

/**
 * Return the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last modification
 */
RQLocalFile.prototype.lastModified = function () {
  var date = this.source.lastModified();

  if (this.data.remote['lastModified'] && !this.isCreatedLocally()) {
    if (date == this.data.local['lastModified'] && date > this.data.remote['lastModified'] && !this.data.refreshed) {
      date = this.data.remote['lastModified'];
    }
  }
  return date;
};

/**
 * Sets the time of last modification, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @param {Number} ms
 * @return {Number} time of last modification
 */
RQLocalFile.prototype.setLastModified = function (ms) {
  this.source.setLastModified(ms);
};

/**
 * Return the time when file status was last changed, in milliseconds since
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} when file status was last changed
 */
RQLocalFile.prototype.lastChanged = function () {
  return this.lastModified();
};

/**
 * Return the create time, in seconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time created
 */
RQLocalFile.prototype.created = function () {
  var date = this.source.created();

  // always use remote created if it's available and is older than the local file
  if (this.data.remote['created'] && this.data.remote['created'] < date) {
    date = this.data.remote.created;
  }

  return date;
};

/**
 * Return the time of last access, in seconds since Jan 1, 1970, 00:00:00.0.
 * Jan 1, 1970, 00:00:00.0.
 *
 * @return {Number} time of last access
 */
RQLocalFile.prototype.lastAccessed = function () {
  return this.source.lastAccessed();
};

/**
 * Read bytes at a certain position inside the file.
 *
 * @param {Buffer} buffer the buffer that the data will be written to
 * @param {Number} offset the offset in the buffer to start writing at
 * @param {Number} length the number of bytes to read
 * @param {Number} position offset where to begin reading from in the file
 * @param {Function} cb callback called with the bytes actually read
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Number} cb.bytesRead number of bytes actually read
 * @param {Buffer} cb.buffer buffer holding the bytes actually read
 */
RQLocalFile.prototype.read = function (buffer, offset, length, position, cb) {
  this.source.read(buffer, offset, length, position, cb);
};

/**
 * Write bytes at a certain position inside the file.
 *
 * @param {Buffer} data buffer to write
 * @param {Number} position position inside file
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalFile.prototype.write = function (data, position, cb) {
  if (this.cacheInfoOnly) {
    cb();
  } else {
    this.source.write(data, position, cb);
  }
};

/**
 * Sets the file length.
 *
 * @param {Number} length file length
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalFile.prototype.setLength = function (length, cb) {
  if (this.cacheInfoOnly) {
    cb();
  } else {
    this.source.setLength(length, cb);
  }
};

/**
 * Delete this file or directory. If this file denotes a directory, it must
 * be empty in order to be deleted.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalFile.prototype.delete = function (cb) {
  var self = this;
  var path = self.getPath();
  var isDir = self.isDirectory();
  self.close(function (err) {
    if (err) {
      cb(err);
    } else if (isDir) {
      self.tree.deleteDirectory(path, cb);
    } else {
      self.tree.delete(path, cb);
    }
  });
};

/**
 * Flush the contents of the file to disk.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalFile.prototype.flush = function (cb) {
  if (this.cacheInfoOnly) {
    cb();
  } else {
    this.source.flush(cb);
  }
};

/**
 * Close this file, releasing any resources.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
RQLocalFile.prototype.close = function (cb) {
  this.source.close(cb);
};
