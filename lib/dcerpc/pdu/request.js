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
    case 'NetShareEnumAll':
      netShareEnumAll(stubDataIn, server, resultHandler);
      break;
    default:
      logger.error('encountered unsupported operation %s (%s v%d.%d)', funcName, consts.SUPPORTED_INTERFACES[pipe.syntaxSpec.uuid].name, pipe.syntaxSpec.version, pipe.syntaxSpec.versionMinor);
      onFault(hdr, consts.NCA_UNSPEC_REJECT, cb);
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

function netShareEnumAll(dataIn, server, cb) {
/*
typedef [handle, string] wchar_t * SRVSVC_HANDLE;

typedef struct _SHARE_ENUM_STRUCT
  {
    DWORD Level;
    [switch_is(Level)] SHARE_ENUM_UNION ShareInfo;
  }   SHARE_ENUM_STRUCT,
*PSHARE_ENUM_STRUCT,
*LPSHARE_ENUM_STRUCT;

typedef [switch_type(DWORD)] union _SHARE_ENUM_UNION {
    [case(0)]
    SHARE_INFO_0_CONTAINER* Level0;
    [case(1)]
    SHARE_INFO_1_CONTAINER* Level1;
    [case(2)]
    SHARE_INFO_2_CONTAINER* Level2;
    [case(501)]
    SHARE_INFO_501_CONTAINER* Level501;
    [case(502)]
    SHARE_INFO_502_CONTAINER* Level502;
    [case(503)]
    SHARE_INFO_503_CONTAINER* Level503;
  } SHARE_ENUM_UNION;

typedef struct _SHARE_INFO_1_CONTAINER
  {
    DWORD EntriesRead;
    [size_is(EntriesRead)] LPSHARE_INFO_1 Buffer;
  } SHARE_INFO_1_CONTAINER;

typedef struct _SHARE_INFO_1
  {
    [string] wchar_t * shi1_netname;
    DWORD shi1_type;
    [string] wchar_t * shi1_remark;
  } SHARE_INFO_1,
*PSHARE_INFO_1,
*LPSHARE_INFO_1;

NET_API_STATUS
  NetrShareEnum (
    [in,string,unique] SRVSVC_HANDLE ServerName,
    [in,out] LPSHARE_ENUM_STRUCT InfoStruct,
    [in] DWORD PreferedMaximumLength,
    [out] DWORD * TotalEntries,
    [in,out,unique] DWORD * ResumeHandle
);
*/
  // parse stub data in

  var off = 0;
  // [in,string,unique] SRVSVC_HANDLE ServerName,
  var refId = dataIn.readUInt32LE(off);
  off += 4;
  var maxCount = dataIn.readUInt32LE(off);
  off += 4;
  var offset = dataIn.readUInt32LE(off);
  off += 4;
  var actCount = dataIn.readUInt32LE(off);
  off += 4;
  var serverName = utils.extractUnicodeBytes(dataIn, off).toString('utf16le');
  off += (2 * (serverName.length + 1));

  // [in,out] LPSHARE_ENUM_STRUCT InfoStruct,
  var level = dataIn.readUInt32LE(off); // level === 1
  off += 4;
  var entriesRead = dataIn.readUInt32LE(off);
  off += 4;
  refId = dataIn.readUInt32LE(off);
  off += 4;
  var count = dataIn.readUInt32LE(off);
  off += 4;
  var buffer = dataIn.readUInt32LE(off);
  off += 4;

  // [in] DWORD PreferedMaximumLength,
  var preferedMaximumLength = dataIn.readUInt32LE(off);
  off += 4;

  // [in,out,unique] DWORD * ResumeHandle
  refId = dataIn.readUInt32LE(off);
  off += 4;
  var resumeHandle = dataIn.readUInt32LE(off);
  off += 4;

  // retrieve list of shares
  var shares = server.listShares();

  // build stub data out

  var dummyRefId = 0x12345678;

  var out = put();
  // [in,out] LPSHARE_ENUM_STRUCT InfoStruct,
  out.word32le(level);
  out.word32le(entriesRead);
  out.word32le(dummyRefId);
  out.word32le(shares.length);
  out.word32le(dummyRefId);
  out.word32le(shares.length);

  for (var i = 0; i < shares.length; i++) {
    var share = shares[i];
    var type = 0x00000000;  // STYPE_DISKTREE
    if (share.name === 'IPC$') {
      type = 0x00000003 | 0x80000000; // STYPE_IPC | STYPE_SPECIAL
    } else if (share.name.substr(-1) === '$') {
      type |= 0x80000000; // |= STYPE_SPECIAL
    }
    // name
    var len = share.name.length + 1;
    out.word32le(dummyRefId);
    out.word32le(len);  //  maxCount
    out.word32le(0);  // offset
    out.word32le(len);  // actCount
    out.put(new Buffer(share.name, 'utf16le'));
    out.pad(2); // terminator

  }


  // align on 32bit boundary
  out.pad(utils.calculatePadLength(out.length(), 4));
  // [out] DWORD * TotalEntries,
  out.word32le(shares.length);

  // [in,out,unique] DWORD * ResumeHandle
  out.word32le(0);  // NULL

  // NET_API_STATUS
  out.word32le(0);

  cb(null, out.buffer());
}

module.exports = handle;
