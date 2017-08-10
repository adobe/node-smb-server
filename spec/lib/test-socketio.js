var EventEmitter = require('events').EventEmitter;
var util = require('util');

function IO() {
  EventEmitter.call(this);
}

util.inherits(IO, EventEmitter);

function SocketIO () {
}

SocketIO.prototype.create = function () {
  return new IO();
};

module.exports = SocketIO;
