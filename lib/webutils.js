/*
 *  Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

'use strict';

var request = require('request');
var reqlog = require('winston').loggers.get('request');

/**
 * Submits a request using the nodejs request module.
 * @param {object} options Options that will be passed directly to the request module.
 * @param {function} cb Will be invoked when the request is complete.
 * @param {Error|string} err Will be truthy if there was an error during the request.
 * @param {Response} resp Object containing response information.
 * @param {string} body The body portion of the response.
 *
 */
function submitRequest(options, cb) {
  var ts = new Date().getTime();
  var method = options.method || 'GET';
  var url = options.url;
  var transferred = 0;

  if (options.headers) {
    if (options.headers['X-Destination']) {
      url += ' > ' + options.headers['X-Destination'];
    }
  }

  reqlog.info('[%d] -> %s %s', ts, method, url);
  return request(options, cb)
    .on('response', function (res) {
      res.on('data', function (chunk) {
        transferred += chunk.length;
      });

      res.on('end', function () {
        var end = new Date().getTime();
        var totalTime = (end - ts) || 1;
        var elapsed = totalTime;
        var time = 'ms';
        if (totalTime > 1000) {
          elapsed /= 1000;
          time = 's';
        }
        var rateText = '';

        if (transferred > 0) {
          var rate = Math.round(transferred / elapsed);
          var measure = 'b';
          if (rate >= 1024) {
            rate /= 1024; // kb
            measure = 'kb';
            if (rate >= 1024) {
              rate /= 1024; // mb
              measure = 'mb';
              if (rate >= 1024) {
                rate /= 1024; // gb
                measure = 'gb';
              }
            }
          }

          rateText = '[' + transferred + 'b][' + Math.round(rate * 10) / 10 + measure + '/' + time + ']';
        }

        reqlog.info('[%d] <- %d %s %s [%d to %d][%dms]%s', ts, res.statusCode, method, url, ts, end, totalTime, rateText);
      });
    })
    .on('error', function (err) {
      reqlog.error('[%d] <- ERR %s %s', ts, method, url, err);
    });
}

function monitorTransferProgress(transfer, serverPath, fullPath, totalSize, progressCallback) {
  var totalRead = 0;
  var lastCheck = 0;
  var startTime = new Date().getTime();
  var rate = 0;
  transfer.on('data', function (chunk) {
    totalRead += chunk.length;
    var currCheck = new Date().getTime();
    // determine byte rate per second
    var elapsed = (currCheck - startTime);
    if (elapsed > 0) {
      rate = Math.round(totalRead / (elapsed / 1000));
    }
    if ((currCheck - lastCheck) >= 1000) {
      lastCheck = currCheck;
      progressCallback({path: serverPath, file: fullPath, read: totalRead, total: totalSize, rate: rate, elapsed: elapsed});
    }
  });
}

module.exports.submitRequest = submitRequest;
module.exports.monitorTransferProgress = monitorTransferProgress;
