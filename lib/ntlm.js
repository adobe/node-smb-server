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

var crypto = require('crypto');

/**
 * Returns the 16-byte NTLM hash of the provided clear-text password
 * @param {String} pwd clear-text password
 * @return {Buffer}
 */
function createHash(pwd) {
  var buf = new Buffer(pwd, 'utf16le');
  var md4 = crypto.createHash('md4');
  md4.update(buf);
  return new Buffer(md4.digest());
}

/**
 * Returns a buffer with random 8 bytes
 */
function createChallenge() {
  return crypto.randomBytes(8);
}

/**
 * Calculates the 24-byte NTLM response based on the NTLM hash and challenge
 * @param ntlmHash
 * @param challenge
 * @return {Buffer}
 */
function calculateResponse(ntlmHash, challenge) {
  // grow 16-byte hash to 21-bytes and zero-pad
  var hash = new Buffer(21);
  ntlmHash.copy(hash);
  hash.fill(0x0, 16);

  // the response consists of 3 8-byte DES encrypted chunks
  var chunks = [];

  var des = crypto.createCipheriv('des-ecb', expandKey(hash.slice(0, 7)), '');
  chunks.push(des.update(challenge));
  des = crypto.createCipheriv('des-ecb', expandKey(hash.slice(7, 14)), '');
  chunks.push(des.update(challenge));
  des = crypto.createCipheriv('des-ecb', expandKey(hash.slice(14)), '');
  chunks.push(des.update(challenge));

  return Buffer.concat(chunks);
}

/*
 * Expand a 7-byte key (56-bit) to a 8-byte (64-bit) key by inserting odd-parity bits.
 *
 * Based on code samples in:
 *    http://www.innovation.ch/personal/ronald/ntlm.html
 */
function expandKey(key56) {
  var PARITY_MASK = 0x01;

  var key64 = new Buffer(8);
  key64[0] = key56[0] & 0xfe;
  key64[0] &= ~PARITY_MASK;
  key64[1] = ((key56[0] << 7) & 0xff) | (key56[1] >> 1);
  key64[1] |= PARITY_MASK;
  key64[2] = ((key56[1] << 6) & 0xff) | (key56[2] >> 2);
  key64[2] &= ~PARITY_MASK;
  key64[3] = ((key56[2] << 5) & 0xff) | (key56[3] >> 3);
  key64[3] |= PARITY_MASK;
  key64[4] = ((key56[3] << 4) & 0xff) | (key56[4] >> 4);
  key64[4] &= ~PARITY_MASK;
  key64[5] = ((key56[4] << 3) & 0xff) | (key56[5] >> 5);
  key64[5] |= PARITY_MASK;
  key64[6] = ((key56[5] << 2) & 0xff) | (key56[6] >> 6);
  key64[6] &= ~PARITY_MASK;
  key64[7] =  (key56[6] << 1) & 0xff;
  key64[7] |= PARITY_MASK;
  return key64;
}

module.exports.createHash = createHash;
module.exports.calculateResponse = calculateResponse;
module.exports.createChallenge = createChallenge;
