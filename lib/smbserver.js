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

var os = require('os');
var net = require('net');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var logger = require('winston').loggers.get('default');
var _ = require('lodash');

var consts = require('./constants');
var DefaultAuthenticator = require('./defaultauthenticator');
var auth = require('./auth');
var SMBConnection = require('./smbconnection');
var SMBLogin = require('./smblogin');
var SMBSession = require('./smbsession');
var SMBShare = require('./smbshare');
var IPCShare = require('./ipcshare');

/**
 * SMB Server
 *
 * @param {Object} config - configuration hash
 * @param {Authenticator} authenticator
 * @constructor
 */
function SMBServer(config, authenticator) {
  // call the super constructor to initialize `this`
  EventEmitter.call(this);

  this.tcpServer = net.createServer();
  this.connections = {};
  this.logins = {};
  this.sessions = {};
  this.shares = {};
  this.trees = {};
  // protocol: CIFS, SMB, SMB2
  this.protocol = config && config.protocol || 'CIFS';
  this.domainName = config && config.domainName || '';
  this.nativeOS = os.type() + ' ' + os.release();
  this.nativeLanMan = consts.NATIVE_LANMAN;
  this.config = config && _.cloneDeep(config) || {};
  this.authenticator = authenticator || new DefaultAuthenticator(config);
  // init shares
  _.forEach(config.shares,
    function (shareCfg, name) {
      var type = shareCfg.backend;
      var Share = require('./backends/' + type + '/share');
      name = name.toUpperCase();  // share names are uppercase
      this.shares[name] = new SMBShare(this, new Share(name, shareCfg));
    },
    this
  );
  // add dummy IPC$ share
  this.shares['IPC$'] = new SMBShare(this, new IPCShare('IPC$'));

  var self = this;
  this.tcpServer.on('connection', function (socket) {
    socket.setNoDelay(true);
    socket.id = ++SMBServer.connectionIdCounter;

    logger.info('established client connection #%d from [%s:%d] -> [%s:%d]', socket.id, socket.remoteAddress, socket.remotePort, socket.localAddress, socket.localPort);

    // setup socket event handlers
    socket.on('end', function () {
      logger.info('client #%d disconnected (received: %dkb, sent: %dkb)', socket.id,  Math.floor(socket.bytesRead / 1000), Math.floor(socket.bytesWritten / 1000));
    });

    socket.on('error', function (err) {
      logger.info('client #%d [%s:%d] connection error', socket.id, socket.remoteAddress, socket.remotePort, err);
      logger.error(err);
    });

    socket.on('close', function (had_error) {
      delete self.connections[socket.id];
    });

    // create a new SMBConnection instance per tcp socket connection
    self.connections[socket.id] = new SMBConnection(socket, self);
  });

  this.tcpServer.on('error', this.onError.bind(this));
  this.tcpServer.on('close', this.onClose.bind(this));
}

util.inherits(SMBServer, EventEmitter);

SMBServer.connectionIdCounter = 0;

SMBServer.prototype.onError = function (err) {
  logger.error(err);
  this.emit('error', err);
};

SMBServer.prototype.onClose = function () {
  logger.info('[%s] SMB server stopped', process.pid);
};

SMBServer.prototype.start = function (port, host, cb) {
  this.tcpServer.listen(port, host, function () {
    logger.info('[%s] SMB server started listening on port %d', process.pid, port);
    cb();
  });
};

SMBServer.prototype.stop = function (cb) {
  this.tcpServer.close(function (err) {
    if (err) {
      logger.error(err);
    }
    cb(err);
  });
};

SMBServer.prototype.createLogin = function () {
  var login = new SMBLogin(this, auth.createChallenge());
  // register login
  this.logins[login.key] = login;
  return login;
};

SMBServer.prototype.getLogin = function (key) {
  return this.logins[key];
};

SMBServer.prototype.destroyLogin = function (key) {
  delete this.logins[key];
};

/**
 *
 * @param {SMBLogin} login
 * @param {String} accountName
 * @param {String} primaryDomain
 * @param {Buffer} caseInsensitivePassword
 * @param {Buffer} caseSensitivePassword
 * @param {Function} cb callback called with the authenticated session
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {SMBSession} cb.session authenticated session
 */
SMBServer.prototype.setupSession = function (login, accountName, primaryDomain, caseInsensitivePassword, caseSensitivePassword, cb) {
  var self = this;
  this.authenticator.authenticate(login.challenge, caseInsensitivePassword, caseSensitivePassword, primaryDomain, accountName, function (err, session) {
    if (err) {
      cb(err);
      return;
    }
    var smbSession = new SMBSession(self, accountName, primaryDomain, session);
    // register session
    self.sessions[smbSession.uid] = smbSession;
    cb(null, smbSession);
  });
};

SMBServer.prototype.getSession = function (uid) {
  return this.sessions[uid];
};

SMBServer.prototype.destroySession = function (uid) {
  delete this.sessions[uid];
};

SMBServer.prototype.getShareNames = function () {
  return _.keys(this.shares);
};

/**
 *
 * @param {SMBSession} session
 * @param {String} shareName
 * @param {Buffer|String} shareLevelPassword optional share-level password (may be null)
 * @param {Function} cb callback called with the connect tree
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {SMBSession} cb.session authenticated session
 */
SMBServer.prototype.connectTree = function (session, shareName, shareLevelPassword, cb) {
  var share = this.shares[shareName];
  if (!share) {
    process.nextTick(function () { cb(new Error('share not found')); });
    return;
  }
  var self = this;
  share.connect(session, shareLevelPassword, function (err, tree) {
    if (err) {
      cb(err);
    } else {
      // register tree
      self.trees[tree.tid] = tree;
      cb(null, tree);
    }
  });
};

SMBServer.prototype.getTree = function (tid) {
  return this.trees[tid];
};

SMBServer.prototype.disconnectTree = function (tid) {
  var tree = this.trees[tid];
  if (tree) {
    tree.disconnect();
    delete this.trees[tid];
  }
};

module.exports = SMBServer;

