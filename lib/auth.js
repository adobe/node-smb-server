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
 * Returns a buffer with random 8 bytes
 */
function createChallenge() {
  return crypto.randomBytes(8);
}

var MAGIC = 'KGS!@#$%';

/**
 * Returns the 16-byte LM hash of the provided clear-text ascii password
 * @param {String} pwd clear-text ascii password
 * @return {Buffer}
 */
function createLMHash(pwd) {
  // make sure ascii password is 14 chars max and uppercase
  var pwdBytes = new Buffer(pwd.substring(0, 14).toUpperCase(), 'ascii');
  // zero pad to 14 bytes
  var keyBuf = new Buffer(14);
  pwdBytes.copy(keyBuf);
  keyBuf.fill(0x0, pwdBytes.length);
  // the results consists of 2 8-byte DES encrypted key chunks
  var parts = [];
  var des = crypto.createCipheriv('des-ecb', expandKey(keyBuf.slice(0, 7)), '');
  parts.push(des.update(MAGIC));
  des = crypto.createCipheriv('des-ecb', expandKey(keyBuf.slice(7)), '');
  parts.push(des.update(MAGIC));
  return Buffer.concat(parts);
}

/**
 * Calculates the 24-byte NTLM response based on the LM hash and challenge
 * @param lmHash
 * @param challenge
 * @return {Buffer}
 */
function calculateLMResponse(lmHash, challenge) {
  // grow 16-byte hash to 21-bytes and zero-pad
  var hash = new Buffer(21);
  lmHash.copy(hash);
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

/**
 * Returns the 16-byte LMv2 hash of the provided clear-text ascii password
 * @param {String} pwd clear-text ascii password
 * @return {Buffer}
 */
function createLM2Hash(pwd) {
  // todo implement
  return null;
}

/**
 * Calculates the 24-byte NTLM response based on the LMv2 hash and challenge
 * @param lm2Hash
 * @param challenge
 * @return {Buffer}
 */
function calculateLM2Response(lm2Hash, challenge) {
  // todo implement
  return null;
}

/**
 * Returns the 16-byte NTLM hash of the provided clear-text password
 * @param {String} pwd clear-text password
 * @return {Buffer}
 */
function createNTLMHash(pwd) {
  var buf = new Buffer(pwd, 'utf16le');
  var md4 = crypto.createHash('md4');
  md4.update(buf);
  return new Buffer(md4.digest());
}

/**
 * Calculates the 24-byte NTLM response based on the NTLM hash and challenge
 * @param ntlmHash
 * @param challenge
 * @return {Buffer}
 */
function calculateNTLMResponse(ntlmHash, challenge) {
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

/**
 * Returns the 16-byte NTLMv2 hash of the provided clear-text password
 * @param {String} pwd clear-text password
 * @return {Buffer}
 */
function createNTLM2Hash(pwd) {
  // todo implement
  return null;
}

/**
 * Calculates the 24-byte NTLMv2 response based on the NTLM hash and challenge
 * @param ntlm2Hash
 * @param challenge
 * @return {Buffer}
 */
function calculateNTLM2Response(ntlm2Hash, challenge) {
  // todo implement
  return null;
}

/*
 * Expand a 7-byte key (56-bit) to a 8-byte (64-bit) key
 * by inserting odd-parity bits.
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

module.exports.createChallenge = createChallenge;

module.exports.lm = {
  createHash: createLMHash,
  calculateResponse: calculateLMResponse
};

module.exports.lm2 = {
  createHash: createLM2Hash,
  calculateResponse: calculateLM2Response
};

module.exports.ntlm = {
  createHash: createNTLMHash,
  calculateResponse: calculateNTLMResponse
};

module.exports.ntlm2 = {
  createHash: createNTLM2Hash,
  calculateResponse: calculateNTLM2Response
};
