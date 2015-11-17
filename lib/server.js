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

var fs = require('fs');
var path = require('path');

var async = require('async');
var logger = require('winston').loggers.get('default');

var actions = [
  readConfiguration,
  setupServer,
  startServer
];

async.waterfall(actions, onStarted);

// Read a config.json file from the file system, parse it and pass it to the next function in the
// chain.

function readConfiguration(done) {
  try {
    var configPath = path.join(__dirname, 'config.json');

    if (!fs.existsSync(configPath)) {
      configPath = path.join(process.cwd(), 'config.json');
    }

    var config = JSON.parse(fs.readFileSync(configPath));

    logger.info('configuration successfully read: %s', configPath);

    done(null, config);
  } catch (e) {
    done(new Error('unable to read the configuration: ' + e.message));
  }
}

// Setup the server

function setupServer(config, done) {
  // custom authenticator? null for using default authenticator
  var authenticator = null;

  // require smbserver.js here in order to don't interfere with the logger setup in the previous step
  var SMBServer = require('./smbserver');
  done(null, config, new SMBServer(config, authenticator));
}

// Start the server

function startServer(config, server, done) {
  var port = config && config.listen && config.listen.port || 445;
  var host = config && config.listen && config.listen.host || '0.0.0.0';
  server.start(port, host, function () {
    done(null, config);
  });
  server.on('error', done);
}

// Handle errors during initialization.

function onStarted(err) {
  if (err) {
    logger.error('error during startup, exiting... : %s', err.message);
    process.exit(1);
  }
}


