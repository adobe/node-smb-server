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

/**
 * property names
 */
consts.JCR_PRIMARYTYPE = 'jcr:primaryType';
consts.JCR_LASTMODIFIED = 'jcr:lastModified';
consts.JCR_CREATED = 'jcr:created';
consts.JCR_CONTENT = 'jcr:content';

/**
 * primary types
 */
consts.NT_FILE = 'nt:file';
consts.NT_FOLDER = 'nt:folder';
consts.SLING_FOLDER = 'sling:Folder';
consts.SLING_ORDEREDFOLDER = 'sling:OrderedFolder';
consts.DAM_ASSET = 'dam:Asset';

module.exports = consts;