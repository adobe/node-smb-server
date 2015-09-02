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

var put = require('put');
var binary = require('binary');
var logger = require('winston');

var consts = require('../../constants');

var ZERO = new Buffer([0]);

function handle(msg, session) {
  // decode dialects
  msg.dialects = [];

  var read = 0;
  binary.parse(msg.data).loop(function (end, vars) {
    // buffer format (0x2: dialect)
    this.skip(1);
    read += 1;

    // extract dialect name (zero-terminated)
    this.scan('dialect', ZERO);
    var dialect = vars['dialect'].toString();
    msg.dialects.push(dialect);
    read += dialect.length + 1;

    if (read >= msg.data.length) {
      end();
    }
  });

  logger.debug('dialects: ', msg.dialects);

  // todo send response
}

module.exports = handle;