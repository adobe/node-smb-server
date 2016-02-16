/*
 *  Copyright 2015 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

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

module.exports = consts;
