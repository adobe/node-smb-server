
var fs = require('fs');
var stream = require('stream');

var request = require('request');
var mime = require('mime');

//var ASSET_NAME = '/temp/test.jpg';
//var LOCAL_FILE_PATH = '/Users/stefan/tmp/gear.jpg';

var ASSET_NAME = '/bullseye.xlsx';
var LOCAL_FILE_PATH = '/Users/stefan/tmp/bullseye.xlsx';

function createAsset(name, cb) {
  var url = 'http://admin:admin@localhost:4502/api/assets' + name;
  var options = {
    url: url,
    method: 'POST',
    headers: {
      'Content-Type': mime.lookup(name)
    }
  };

  var emptyStream = new stream.PassThrough();
  emptyStream.end(new Buffer(0));
  emptyStream.pipe(
    request(options, function (err, resp, body) {
      if (err) {
        console.log('failed to create %s', name, err);
        cb(err);
      } else if (resp.statusCode !== 201) {
        console.log('failed to create %s [statusCode: %d]', name, resp.statusCode, body);
        cb('failed');
      } else {
        // succeeded
        console.log('created %s', name, body);
        cb();
      }
    })
  );
}

function deleteAsset(name, cb) {
  var url = 'http://admin:admin@localhost:4502/api/assets' + name;
  var options = {
    url: url,
    method: 'DELETE'
  };
  request(options, function (err, resp, body) {
    if (err) {
      console.log('failed to delete %s', name, err);
      cb(err);
    } else if (resp.statusCode !== 200) {
      console.log('failed to delete %s [statusCode: %d]', name, resp.statusCode, body);
      cb('failed');
    } else {
      // succeeded
      console.log('deleted %s', name, body);
      cb();
    }
  });
}

function updateAsset(name, cb) {
  var url = 'http://admin:admin@localhost:4502/api/assets' + name;
  var options = {
    url: url,
    method: 'PUT'
  };
  fs.createReadStream(LOCAL_FILE_PATH).pipe(
    request(options, function (err, resp, body) {
      if (err) {
        console.log('failed to spool %s to %s', LOCAL_FILE_PATH, name, err);
        cb(err);
      } else if (resp.statusCode !== 200) {
        console.log('failed to spool %s to %s [statusCode: %d]', LOCAL_FILE_PATH, name, resp.statusCode, body);
        cb('failed');
      } else {
        // succeeded
        fs.stat(LOCAL_FILE_PATH, function (err, stats) {
          if (err) {
            cb(err);
          } else {
            console.log('updated %s', name, body);
            cb();
          }
        });
      }
    })
  );
}

createAsset(ASSET_NAME, function (err) {
  if (err) {
    console.log(err);
  } else {
    updateAsset(ASSET_NAME, function (err) {
      if (err) {
        console.log(err);
      } else {
        deleteAsset(ASSET_NAME, function (err) {
          if (err) {
            console.log(err);
          } else {
            console.log('finished');
          }
        });
      }
    });
  }

});