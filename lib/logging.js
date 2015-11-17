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
var winston = require('winston');

var CONFIG_FILE = 'logging.json';

// Read a config.json file from the file system, parse it and pass it to the next function in the
// chain.

function init(configFile, done) {
  try {
    if (!configFile) {
      configFile = CONFIG_FILE;
    }
    var configPath = path.join(__dirname, configFile);

    if (!fs.existsSync(configPath)) {
      configPath = path.join(process.cwd(), configFile);
    }

    var logConfig = JSON.parse(fs.readFileSync(configPath));

    // configure loggers
    Object.keys(logConfig).forEach(function (key) {
      winston.loggers.add(key, logConfig[key]);
    });
    var logger = winston.loggers.get('default');
    logger.info('logging initialized.');

    done(null);
  } catch (e) {
    done(new Error('unable to read the configuration: ' + e.message));
  }
}

module.exports = init;