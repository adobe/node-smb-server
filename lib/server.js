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
var net = require('net');
var logger = require('winston');

var SMBConnection = require('./smbconnection');
var SMBServer = require('./smbserver');

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
/*
    logger.add(logger.transports.File, { filename: 'server.log' });
    logger.remove(logger.transports.Console);
*/
    logger.level = 'debug';
    logger.info('configuration successfully read: %s', configPath);

    done(null, config);
  } catch (e) {
    done(new Error('unable to read the configuration: ' + e.message));
  }
}

// Setup the server

function setupServer(config, done) {
  var tcpServer = net.createServer(function (socket) {
    logger.info('established socket connection from [%s]', socket.remoteAddress);
    socket.on('end', function() {
      logger.info('client disconnected');
    });
    // create a new SMBConnection instance per tcp socket connection
    new SMBConnection(socket, smbServer);
  });
  var smbServer = new SMBServer(config, tcpServer);

  tcpServer.on('error', function (err) {
    logger.error(err);
  });

  tcpServer.on('close', function () {
    logger.info('server shut down');
  });

  done(null, config, tcpServer);
}

// Start the server

function startServer(config, server, done) {
  var port = config && config.listen && config.listen.port || 445;
  var host = config && config.listen && config.listen.host || 'localhost';
  server.listen(port, host, function () {
    logger.info('[%s] server listening on port %d', process.pid, port);
  });
  done(null, config);
}

// Handle errors during initialization.

function onStarted(err) {
  if (err) {
    logger.error('error during startup, exiting... : %s', err.message);
    process.exit(1);
  }
  logger.info('SMB server started');
}


