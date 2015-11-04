
var request = require('request');

var options = {
  url: 'http://localhost:4502/content/dam/geometrixx-outdoors/activities/hiking/PDP_2_c05.jpg',
  //url: 'http://localhost:4502/content/dam/geometrixx-outdoors/activities/hiking',
  auth: { user: 'admin', pass: 'admin' },
  method: 'HEAD'
};

request(options, function (err, resp, body) {
  if (err) {
    console.log(err);
  } else {
    console.log(resp.toJSON());
  }
});
