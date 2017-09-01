/*
 *  Copyright 2015 Adobe Systems Incorporated. All rights reserved.
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

var fs = require('fs');
var path = require('path');

var winston = require('winston');
var _ = require('lodash');

var CONFIG_FILE = 'logging.json';

// Read a config.json file from the file system, parse it and pass it to the next function in the
// chain.

function init(configFile, done) {
  try {
    var logConfig;
    if (_.isObject(configFile)) {
      logConfig = configFile;
    } else {
      if (!configFile) {
        configFile = CONFIG_FILE;
      }

      var configPath = path.join(__dirname, configFile);
      if (!fs.existsSync(configPath)) {
        configPath = path.join(process.cwd(), configFile);
      }

      logConfig = JSON.parse(fs.readFileSync(configPath));
    }

    // configure loggers
    Object.keys(logConfig).forEach(function (key) {
      var transports = [];
      if (logConfig[key].transports) {
        for (var i = 0; i <  logConfig[key].transports.length; i++) {
          var transport = logConfig[key].transports[i];
          if (winston.loggers.get(transport)) {
            transports.push(winston.loggers.get(transport));
          }
        }
      }
      if (transports.length) {
        winston.loggers.add(key, {
          transports: transports
        });
      } else {
        winston.loggers.add(key, logConfig[key]);
      }
    });
    var logger = winston.loggers.get('default');
    logger.info('logging initialized.');

    done(null);
  } catch (e) {
    done(new Error('unable to read the configuration: ' + e.message));
  }
}

module.exports = init;
