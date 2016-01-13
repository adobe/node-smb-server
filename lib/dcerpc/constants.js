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

var _ = require('lodash');

var consts = {};

/**
 * Connection-oriented RPC PDU types
 */
consts.PDUTYPE_TO_STRING = {
  0x00: 'request',
  0x02: 'response',
  0x03: 'fault',
  0x0b: 'bind',
  0x0c: 'bind_ack',
  0x0d: 'bind_nak',
  0x0e: 'alter_context',
  0x0f: 'alter_context_resp',
  0x11: 'shutdown',
  0x12: 'co_cancel',
  0x13: 'orphaned'
};

consts.STRING_TO_PDUTYPE = _.invert(consts.PDUTYPE_TO_STRING);

consts.COMMON_HEADER_LENGTH = 16;
consts.HEADER_FRAGLENGTH_OFFSET = 8;

consts.SUPPORTED_INTERFACES = {
  '12345778-1234-abcd-ef00-0123456789ab': {
    name: 'LSARPC',
    '0.0': {
      0x2d:	'LsaGetUserName',
      0x2c:	'LsaOpenPolicy2',
      0x0e:	'LsaLookupNames',
      0x00:	'LsaClose'
    }
  },
  '4b324fc8-1670-01d3-1278-5a47bf6ee188': {
    name: 'SRVSVC',
    '3.0': {
      0x0f: 'NetShareEnumAll'
    }
  },
};

consts.NDR_UUID = '8a885d04-1ceb-11c9-9fe8-08002b104860'; // transfer syntax
consts.NDR_VERSION = '2.0'; // transfer syntax version

/**
 * flags
 */
consts.PFC_FIRST_FRAG = 0x01;
consts.PFC_LAST_FRAG = 0x02;
consts.PFC_OBJECT_UUID = 0x80;

/**
 * reject reason
 */
consts.BIND_REJECT_REASON_NOT_SPECIFIED = 0;
consts.BIND_REJECT_TEMPORARY_CONGESTION = 1;
consts.BIND_REJECT_LOCAL_LIMIT_EXCEEDED = 2;
consts.BIND_REJECT_CALLED_PADDR_UNKNOWN = 3; /* not used */
consts.BIND_REJECT_PROTOCOL_VERSION_NOT_SUPPORTED = 4;
consts.BIND_REJECT_DEFAULT_CONTEXT_NOT_SUPPORTED = 5; /* not used */
consts.BIND_REJECT_USER_DATA_NOT_READABLE = 6; /* not used */
consts.BIND_REJECT_NO_PSAP_AVAILABLE = 7; /* not used */

/**
 * DCE/RPC Reject/Fault Status Codes
 */
consts.NCA_RPC_VERSION_MISMATCH = 0x1c000008;  // The server does not support the RPC protocol version specified in the request PDU.
consts.NCA_UNSPEC_REJECT = 0x1c000009; // The request is being rejected for unspecified reasons.
consts.NCA_MANAGER_NOT_ENTERED = 0x1c00000c;  // The operation number passed in the request PDU is greater than or equal to the number of operations in the interface.
consts.NCA_OP_RNG_ERROR = 0x1c010002; // The server does not export the requested interface.
consts.NCA_UNK_IF = 0x1c010003; // The server boot time passed in the request PDU does not match the actual server boot time.
consts.NCA_PROTO_ERROR = 0x1c01000b;  // The output parameters of the operation exceed their declared maximum size.
consts.NCA_OUT_ARGS_TOO_BIG = 0x1c010013; // The output parameters of the operation exceed their declared maximum size.
consts.NCA_SERVER_TOO_BUSY = 0x1c010014;  // The server is too busy to handle the call.
consts.NCA_UNSUPPORTED_TYPE = 0x1c010017; // The server does not implement the requested operation for the type of the requested object.
consts.NCA_INVALID_PRES_CONTEXT_ID = 0x1c00001c;  // Invalid presentation context ID.
consts.NCA_UNSUPPORTED_AUTHN_LEVEL = 0x1c00001d; // The server did not support the requested authentication level.
consts.NCA_INVALID_CHECKSUM = 0x1c00001f; // Invalid checksum.
consts.NCA_INVALID_CRC = 0x1c000020; // Invalid CRC.

module.exports = consts;
