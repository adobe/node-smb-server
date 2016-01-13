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
var logger = require('winston').loggers.get('dcerpc');

var consts = require('../constants');
var packet = require('../packet');
var utils = require('../../utils');

var assocGroupCounter = 0;

/**
 * REQUEST (0x00): The request PDU is used for an initial call request.
 *
 * @param {Object} hdr - common PDU header
 * @param {Buffer} buf - the raw PDU buffer
 * @param {SMBFile} pipe - an SMBFile instance
 * @param {SMBServer} server - an SMBServer instance
 * @param {Function} cb callback called with the PDU's response
 * @param {String|Error} cb.error error (non-null if an error occurred)
 * @param {Buffer} cb.response buffer holding the bytes of the encoded response PDU
 */
function handle(hdr, buf, pipe, server, cb) {
  // parse request specific header fields
  var off = consts.COMMON_HEADER_LENGTH;
  hdr.allocHint = buf.readUInt32LE(off);
  off += 4;
  hdr.ctxId = buf.readUInt16LE(off);
  off += 2;
  hdr.opnum = buf.readUInt16LE(off);
  off += 2;
  if (hdr.flags & consts.PFC_OBJECT_UUID) {
    hdr.objectUUIDRaw = buf.slice(off, off + 16);
    hdr.objectUUID = packet.rawUUIDToString(hdr.objectUUIDRaw);
    off += 16;
  }

  var stubDataIn = buf.slice(off, hdr.fragLength - hdr.authLength);

  var iface = consts.SUPPORTED_INTERFACES[pipe.syntaxSpec.uuid][pipe.syntaxSpec.version + '.' + pipe.syntaxSpec.versionMinor];
  var funcName = iface[hdr.opnum];
  if (!funcName) {
    logger.error('encountered unsupported operation 0x%s (%s v%d.%d)', hdr.opnum.toString(16), consts.SUPPORTED_INTERFACES[pipe.syntaxSpec.uuid].name, pipe.syntaxSpec.version, pipe.syntaxSpec.versionMinor);
    onFault(hdr, consts.NCA_UNSPEC_REJECT, cb);
    return;
  }

  logger.debug('%s (%s v%d.%d)', funcName, consts.SUPPORTED_INTERFACES[pipe.syntaxSpec.uuid].name, pipe.syntaxSpec.version, pipe.syntaxSpec.versionMinor);

  function resultHandler(err, outData) {
    if (err) {
      onFault(hdr, consts.NCA_UNSPEC_REJECT, cb);
    } else {
      onSuccess(hdr, outData, cb);
    }
  }

  switch (funcName) {
    case 'LsaGetUserName':
      lsaGetUserName(stubDataIn, resultHandler);
      break;
    case 'LsaOpenPolicy2':
      lsaOpenPolicy2(stubDataIn, resultHandler);
      break;
    case 'LsaLookupNames':
      lsaLookupNames(stubDataIn, resultHandler);
      break;
    case 'LsaClose':
      lsaClose(stubDataIn, resultHandler);
      break;
    case 'NetShareEnumAll':
      netShareEnumAll(stubDataIn, resultHandler);
      break;
  }
}

function onFault(hdr, status, cb) {
  hdr.type = consts.STRING_TO_PDUTYPE['fault'];
  var hdrBuf = packet.serializeCommonHeaderFields(hdr);

  var out = put();
  out.put(hdrBuf);
  out.word32le(0)  // alloc_hint
    .word16le(hdr.ctxId)  // p_cont_id
    .word8(0) // cancel_count
    .word8(0) // reserved
    .word32le(status) // status
    .put(new Buffer([ 0x00, 0x00, 0x00, 0x00 ]));  // reserved2
 var outBuf = out.buffer();
  // set actual fragLength
  outBuf.writeUInt16LE(outBuf.length, consts.HEADER_FRAGLENGTH_OFFSET);

  cb(null, outBuf);
}

function onSuccess(hdr, stubData, cb) {
  hdr.type = consts.STRING_TO_PDUTYPE['response'];
  var hdrBuf = packet.serializeCommonHeaderFields(hdr);

  var out = put();
  out.put(hdrBuf);
  out.word32le(0)  // alloc_hint
    .word16le(hdr.ctxId)  // p_cont_id
    .word8(0) // cancel_count
    .word8(0) // reserved
    .put(stubData);  // stub data
  var outBuf = out.buffer();
  // set actual fragLength
  outBuf.writeUInt16LE(outBuf.length, consts.HEADER_FRAGLENGTH_OFFSET);

  cb(null, outBuf);
}

function lsaGetUserName(dataIn, cb) {
/*
NTSTATUS lsa_GetUserName(
  [in,unique] [string,charset(UTF16)] uint16 *system_name,
  [in,out,ref] lsa_String **account_name,
  [in,out,unique] lsa_String **authority_name
);
*/
  // todo parse stub data in

  var out = put();
  // todo build stub data out
  cb(null, out.buffer());
}

function lsaOpenPolicy2(dataIn, cb) {
/*
NTSTATUS lsa_OpenPolicy2 (
  [in,unique]      [string,charset(UTF16)] uint16 *system_name,
  [in]  lsa_ObjectAttribute *attr,
  [in]  lsa_PolicyAccessMask access_mask,
  [out] policy_handle *handle
);
*/
  // todo parse stub data in

  var out = put();
  // todo build stub data out
  cb(null, out.buffer());
}

function lsaLookupNames(dataIn, cb) {
/*
NTSTATUS lsa_LookupNames (
  [in]         policy_handle *handle,
  [in,range(0,1000)] uint32 num_names,
  [in,size_is(num_names)]  lsa_String names[],
  [out,ref]    lsa_RefDomainList **domains,
  [in,out,ref] lsa_TransSidArray *sids,
  [in]         lsa_LookupNamesLevel level,
  [in,out,ref] uint32 *count
);
*/
  // todo parse stub data in

  var out = put();
  // todo build stub data out
  cb(null, out.buffer());
}

function lsaClose(dataIn, cb) {
/*
NTSTATUS lsa_Close (
  [in,out]     policy_handle *handle
);
*/
  // todo parse stub data in

  var out = put();
  // todo build stub data out
  cb(null, out.buffer());
}

function netShareEnumAll(dataIn, cb) {
/*
WERROR srvsvc_NetShareEnumAll (
  [in,unique]   [string,charset(UTF16)] uint16 *server_unc,
  [in,out,ref] srvsvc_NetShareInfoCtr *info_ctr,
  [in]   uint32 max_buffer,
  [out,ref]  uint32 *totalentries,
  [in,out,unique]   uint32 *resume_handle
);
*/
  // todo parse stub data in

  var out = put();
  // todo build stub data out
  cb(null, out.buffer());
}

module.exports = handle;
