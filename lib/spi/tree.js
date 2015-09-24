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

/**
 * abstract tree:
 *
 * properties:
 *
 * exists
 * share
 *
 * methods:
 *
 * file = open(name)
 * [] = list(pattern)
 * result = createFile(name)
 * result = createDirectory(name)
 * result = delete(name)
 * result = rename(oldName, newName)
 * flush()
 * disconnect()
 */
