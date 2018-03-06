function App() {

}

App.prototype.use = function () {

};

App.prototype.get = function () {

};

App.prototype.post = function () {

};

function Express() {

}

Express.prototype.create = function () {
  return new App();
};

Express.prototype.static = function (path) {

};

module.exports = Express;
