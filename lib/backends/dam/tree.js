/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
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
 **************************************************************************/

'use strict';

var Util = require('util');
var Path = require('path');
var stream = require('stream');

var logger = require('winston').loggers.get('spi');
var request = require('request');
var async = require('async');
var mime = require('mime');
var mkdirp = require('mkdirp');

var JCRTree = require('../jcr/tree');
var DAMFile = require('./file');
var SMBError = require('../../smberror');
var consts = require('../../constants');
var utils = require('../../utils');
var JCR = require('../jcr/constants');

/**
 * Creates an instance of Tree.
 *
 * @constructor
 * @this {DAMTree}
 * @param {DAMShare} share parent share
 * @param {Object} content JCR node representation
 * @param {Tree} tempFilesTree temporary files tree
 */
var DAMTree = function (share, content, tempFilesTree) {
  if (! (this instanceof DAMTree)) {
    return new DAMTree(share, content, tempFilesTree);
  }

  JCRTree.call(this, share, content, tempFilesTree);
};

// the DAMTree prototype inherits from JCRTree
Util.inherits(DAMTree, JCRTree);

//------------------------------------------------------------------< JCRTree >

DAMTree.prototype.createFileInstance = function (filePath, content, fileLength) {
  return new DAMFile(filePath, content, fileLength, this);
};

DAMTree.prototype.isFilePrimaryType = function (primaryType) {
  return [ JCR.NT_FILE, JCR.DAM_ASSET ].indexOf(primaryType) > -1;
};

DAMTree.prototype.isDirectoryPrimaryType = function (primaryType) {
  return [ JCR.NT_FOLDER, JCR.SLING_FOLDER, JCR.SLING_ORDEREDFOLDER ].indexOf(primaryType) > -1;
};

DAMTree.prototype.isTempFileName = function (name) {
  // call base class method
  return JCRTree.prototype.isTempFileName.call(this, name);
};

DAMTree.prototype.fetchContent = function (name, depth, cb) {
  // call base class method
  return JCRTree.prototype.fetchContent.call(this, name, depth, cb);
};

DAMTree.prototype.fetchFileLength = function (path, cb) {
  // call base class method
  return JCRTree.prototype.fetchFileLength.call(this, path, cb);
};

//---------------------------------------------------------------------< Tree >

/**
 * Test whether or not the specified file exists.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the result
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {Boolean} cb.exists true if the file exists; false otherwise
 */
DAMTree.prototype.exists = function (name, cb) {
  // call base class method
  return JCRTree.prototype.exists.call(this, name, cb);
};

/**
 * Open an existing file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called with the opened file
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File} cb.file opened file
 */
DAMTree.prototype.open = function (name, cb) {
  // call base class method
  return JCRTree.prototype.open.call(this, name, cb);
};

/**
 * List entries, matching a specified pattern.
 *
 * @param {String} pattern pattern
 * @param {Function} cb callback called with an array of matching files
 * @param {SMBError} cb.error error (non-null if an error occurred)
 * @param {File[]} cb.files array of matching files
 */
DAMTree.prototype.list = function (pattern, cb) {
  // call base class method
  return JCRTree.prototype.list.call(this, pattern, cb);
};

/**
 * Create a new file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.createFile = function (name, cb) {
  logger.debug('[%s] createFile %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    // make sure parent path exists
    mkdirp.sync(Path.join(this.tempFilesTree.share.path, utils.getParentPath(name)));
    this.tempFilesTree.createFile(name, cb);
    return;
  }

  var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + name;
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'POST',
    headers: {
      'Content-Type': mime.lookup(name)
    }
  });

  var emptyStream = new stream.PassThrough();
  emptyStream.end(new Buffer(0));
  emptyStream.pipe(
    request(options, function (err, resp, body) {
      if (err) {
        logger.error('failed to create %s', name, err);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else if (resp.statusCode !== 201) {
        logger.error('failed to create %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
        cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
      } else {
        // succeeded
        cb();
      }
    })
  );
};

/**
 * Create a new directory.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.createDirectory = function (name, cb) {
  logger.debug('[%s] createDirectory %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    // make sure parent path exists
    mkdirp.sync(Path.join(this.tempFilesTree.share.path, utils.getParentPath(name)));
    this.tempFilesTree.createDirectory(name, cb);
    return;
  }

  var parentPath = utils.getParentPath(name) || '';
  var pathName = utils.getPathName(name);
  var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + parentPath + '/*';
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'POST',
    form: {
      name: pathName
    },
  });
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to create %s', name, err);
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else if (resp.statusCode !== 201) {
      logger.error('failed to create %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else {
      // succeeded
      cb();
    }
  });
};

/**
 * Delete a file.
 *
 * @param {String} name file name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.delete = function (name, cb) {
  logger.debug('[%s] delete %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    this.tempFilesTree.delete(name, cb);
    return;
  }

  var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + name;
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'DELETE',
  });
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to delete %s', name, err);
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else if (resp.statusCode !== 200) {
      logger.error('failed to delete %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else {
      // succeeded
      cb();
    }
  });
};

/**
 * Delete a directory. It must be empty in order to be deleted.
 *
 * @param {String} name directory name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.deleteDirectory = function (name, cb) {
  logger.debug('[%s] deleteDirectory %s', this.share.config.backend, name);
  if (this.isTempFileName(name)) {
    this.tempFilesTree.deleteDirectory(name, cb);
    return;
  }

  var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + name;
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'DELETE',
  });
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to delete %s', name, err);
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else if (resp.statusCode !== 200) {
      logger.error('failed to delete %s - %s %s [%d]', name, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else {
      // succeeded
      cb();
    }
  });
};

function copyAndDelete(srcFile, destFile, cb) {
  if (srcFile.isFile()) {
    // file: copy & delete single file
    var srcLength = srcFile.size();
    var buf = new Buffer(0xffff);
    var read = 0;
    async.doUntil(
      function (callback) {
        srcFile.read(buf, 0, buf.length, read, function (err, bytesRead, data) {
          destFile.write(data, read, function (err) {
            if (!err) {
              read += bytesRead;
            }
            callback(err);
          });
        });
      },
      function () {
        return read >= srcLength;
      },
      function (err) {
        if (err) {
          cb(err);
          return;
        }
        // flush & close dest file, close & delete src file
        async.series([
            function (callback) {
              destFile.flush(callback);
            },
            function (callback) {
              destFile.close(callback);
            },
            function (callback) {
              srcFile.close(callback);
            },
            function (callback) {
              srcFile.delete(callback);
            }
          ],
          function (err) {
            cb(err);
          }
        );
      }
    );
  } else {
    // directory: list src files and copy recursively, delete src dir
    async.series([
        function (callback) {
          var pattern = srcFile.getPath() + '/*';
          srcFile.getTree().list(pattern, function (err, files) {
            if (err) {
              callback(err);
              return;
            }
            async.each(files,
              function (file, callback1) {
                // create & open dest file
                var destPath = Path.join(destFile.getPath(), file.getName());
                var destTree = destFile.getTree();
                var createFn = file.isFile() ? destTree.createFile : destTree.createDirectory;
                createFn.call(destTree, destPath, function (err) {
                  if (err) {
                    callback1(err);
                  } else {
                    destTree.open(destPath, function (err, destFile) {
                      if (err) {
                        callback1(err);
                      } else {
                        // recurse
                        copyAndDelete(file, destFile, callback1);
                      }
                    });
                  }
                });
              },
              function (err) {
                callback(err);
              }
            );
          });
        },
        function (callback) {
          srcFile.delete(callback);
        }
      ],
      function (err) {
        cb(err);
      }
    );
  }
}

/**
 * Rename a file or directory.
 *
 * @param {String} oldName old name
 * @param {String} newName new name
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.rename = function (oldName, newName, cb) {
  logger.debug('[%s] rename %s to %s', this.share.config.backend, oldName, newName);
  if (this.isTempFileName(oldName) && this.isTempFileName(newName)) {
    this.tempFilesTree.rename(oldName, newName, cb);
    return;
  }

  if (this.isTempFileName(oldName) || this.isTempFileName(newName)) {
    // rename across trees
    var srcTree = this.isTempFileName(oldName) ? this.tempFilesTree : this;
    var destTree = this.isTempFileName(newName) ? this.tempFilesTree : this;

    srcTree.open(oldName, function (err, srcFile) {
      if (err) {
        cb(err);
        return;
      }
/*
      srcFile.copyTo(destTree, newName, function (err) {
        if (err) {
          cb(err);
        } else {
          srcFile.delete(cb);
        }
      });
*/
      var createFn = srcFile.isFile() ? destTree.createFile : destTree.createDirectory;
      createFn.call(destTree, newName, function (err) {
        if (err) {
          cb(err);
        } else {
          destTree.open(newName, function (err, destFile) {
            if (err) {
              cb(err);
            } else {
              copyAndDelete(srcFile, destFile, cb);
            }
          });
        }
      });
    });
    return;
  }

  var url = 'http://' + this.share.host + ':' + this.share.port + '/api/assets' + oldName;
  var options = this.share.applyRequestDefaults({
    url: url,
    method: 'MOVE',
    headers: {
      'X-Destination': '/api/assets' + encodeURI(newName),
      'X-Depth': 'infinity',
      'X-Overwrite': 'F'
    }
  });
  request(options, function (err, resp, body) {
    if (err) {
      logger.error('failed to move %s to %s', oldName, newName, err);
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else if (resp.statusCode !== 201) {
      logger.error('failed to move %s to %s - %s %s [%d]', oldName, newName, this.method, this.href, resp.statusCode, body);
      cb(new SMBError(consts.STATUS_UNSUCCESSFUL));
    } else {
      // succeeded
      cb();
    }
  });
};

/**
 * Disconnect this tree.
 *
 * @param {Function} cb callback called on completion
 * @param {SMBError} cb.error error (non-null if an error occurred)
 */
DAMTree.prototype.disconnect = function (cb) {
  // call base class method
  return JCRTree.prototype.disconnect.call(this, cb);
};

module.exports = DAMTree;
