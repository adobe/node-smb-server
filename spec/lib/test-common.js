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

var testfs = require('./test-fs');
var testDatastore = require('./test-nedb');
var testMkdirp = require('./test-mkdirp');
var testRequest = require('./test-request');
var testHttp = require('./test-http');
var testSocketIO = require('./test-socketio');
var testExpress = require('./test-express');
var testBodyParser = require('./test-body-parser');
var testArchiver = require('./test-archiver');

var globalfs = new testfs();
var globalMkdirp = new testMkdirp(globalfs);
var globalHttp = new testHttp();
var globalSocketIO = new testSocketIO();
var globalExpress = new testExpress();
var globalBodyParser = new testBodyParser();
var globalArchiver = new testArchiver();

globalfs['@global'] = true;
testRequest.request['@global'] = true;
testDatastore['@global'] = true;
globalMkdirp.mkdirp['@global'] = true;
testHttp['@global'] = true;
globalSocketIO.create['@global'] = true;
globalExpress.create['@global'] = true;
globalExpress.create['static'] = globalExpress.static;
globalBodyParser['@global'] = true;
globalArchiver.archive['@global'] = true;

var proxyquire = require('proxyquire').noCallThru();

var events = require('events').EventEmitter;
var Path = require('path');

// force paths to use forward slashes for compatibility
Path.sep = '/';
Path.join2 = Path.join;
Path.join = function () {
  var res = Path.join2.apply({}, arguments);
  return res.replace(/\\/g, Path.sep);
};

spyOn(globalfs, 'createReadStream').andCallThrough();
spyOn(globalfs, 'createWriteStream').andCallThrough();
spyOn(globalfs, 'writeFileSync').andCallThrough();
spyOn(globalfs, 'unlinkSync').andCallThrough();
spyOn(globalfs, 'statSync').andCallThrough();

function TestCommon() {
  var self = this;

  globalfs.clearAll();
  testRequest.clearAll();

  self.fs = globalfs;
  self.request = testRequest;

  self.setPipeDelay = function (delayFunc) {
    self.fs.setPipeDelay(delayFunc);
  };
}

TestCommon.require = function (dirname, name) {
  return proxyquire(Path.join(dirname, name), {
    'request': testRequest.request,
    'requestretry': testRequest.request,
    'fs': globalfs,
    'mkdirp': globalMkdirp.mkdirp,
    'nedb': testDatastore,
    'socket.io': globalSocketIO.create,
    'http': globalHttp,
    'express': globalExpress.create,
    'body-parser': globalBodyParser,
    'archiver': globalArchiver.archive
  });
};

TestCommon.runSync = function () {
  var asyncFunc = arguments.pop();
  var sync = true;
  asyncFunc.apply(null, arguments, function () {
    sync = false;
  });
  while(sync) {require('deasync').sleep(100);}

  return true;
};

module.exports = TestCommon;
