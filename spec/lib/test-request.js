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
var async = require('async');

var TestStream = require('./test-stream');

var requestedUrls = [];
var urls;
var statusCodes;
var createCb = function (url, data, cb) {
  cb();
}

var updateCb = function (url, data, cb) {
  cb();
}

var deleteCb = function (url, cb) {
  cb();
}

function TestRequest(options, endCb) {
  TestStream.call(this, 'test-request');

  this.url = options.url;
  this.method = options.method || 'GET';
  this.aborted = false;
  this.statusCode = 501;
  this.endCb = endCb;
}

util.inherits(TestRequest, TestStream);

TestRequest.prototype.setStatusCode = function (statusCode) {
  this.statusCode = statusCode;
};

TestRequest.prototype.end = function (data, encoding, cb) {
  var self = this;

  function _doEnd() {
    var res = new TestResponse(self.statusCode, '');
    if (cb) {
      cb(null, res);
    }
    self.emit('end');
    self.emit('response', res);
    if (self.endCb) {
      self.endCb(null, res);
    }
    res.emit('end');
  }

  TestStream.prototype.end(data, encoding, function (err) {
    if (!err) {
      if (self.method == 'POST') {
        createCb(self.url, data, _doEnd);
      } else if (self.method == 'PUT') {
        updateCb(self.url, data, _doEnd);
      } else if (self.method == 'DELETE') {
        deleteCb(self.url, _doEnd);
      } else {
        _doEnd();
      }
    }
  });
};

TestRequest.prototype.abort = function () {
  this.aborted = true;
};

function TestResponse(statusCode) {
  TestStream.call(this);

  this.statusCode = statusCode;
}

util.inherits(TestResponse, TestStream);

function clearAll() {
  requestedUrls = [];
  urls = [];
  statusCodes = {};
};

function request(options, cb) {
  requestedUrls.push(options.url);

  var statusCode = 404;
  var req = new TestRequest(options, cb);
  if (options.method == 'GET' || !options.method) {
    if (urls[options.url]) {
      req.setReadStream(urls[options.url]);
    } else {
      statusCode = 404;
    }
  } else if (options.method == 'POST') {
    // insert
    statusCode = 201;
  } else if (options.method == 'PUT') {
    if (urls[options.url]) {
      statusCode = 200;
    }
  } else if (options.method == 'DELETE') {
    if (urls[options.url]) {
      statusCode = 200;
    }
    // end deletes immediately because there is no streaming
    // involved
    req.end();
  }

  if (statusCodes[options.url]) {
    statusCode = statusCodes[options.url];
  }

  req.setStatusCode(statusCode);
  return req;
};

function registerUrl(url, callback) {
  urls[url] = callback;
}

function registerCreate(cb) {
  createCb = cb;
}

function registerUpdate(cb) {
  updateCb = cb;
}

function registerDelete(cb) {
  deleteCb = cb;
}

function registerUrlStatusCode(url, statusCode) {
  statusCodes[url] = statusCode;
}

function wasUrlRequested(url) {
  return (requestedUrls.indexOf(url) >= 0);
}

module.exports.request = request;
module.exports.clearAll = clearAll;
module.exports.registerUrl = registerUrl;
module.exports.registerCreate = registerCreate;
module.exports.registerUpdate = registerUpdate;
module.exports.registerDelete = registerDelete;
module.exports.registerUrlStatusCode = registerUrlStatusCode;
module.exports.wasUrlRequested = wasUrlRequested;
