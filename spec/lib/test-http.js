var EventEmitter = require('events').EventEmitter;
var util = require('util');

function Server() {
  EventEmitter.call(this);
}

util.inherits(Server, EventEmitter);

Server.prototype.listen = function (port, address, cb) {
  this.port = port;
  cb.call(this);
  return this;
};

Server.prototype.address = function () {
  return {
    port: this.port
  };
};

function Http() {
  EventEmitter.call(this);
}

util.inherits(Http, EventEmitter);

Http.prototype.Server = function () {
  return new Server();
};

module.exports = Http;