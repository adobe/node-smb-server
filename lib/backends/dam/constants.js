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

var consts = {};

consts.DAM_ROOT_PATH = '/content/dam';
consts.ASSETS_API_PATH = '/api/assets';

/**
 * property names
 */
consts.ASSET_SIZE = 'asset:size';
consts.ASSET_READONLY = 'asset:readonly';
consts.NAME = 'name';

/**
 * primary types
 */
consts.DAM_ASSET = 'dam:Asset';

/**
 * misc.
 */
consts.CLASS_FOLDER = 'assets/folder';
consts.CLASS_ASSET = 'assets/asset';

module.exports = consts;
