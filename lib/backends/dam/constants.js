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

consts.DAM_ROOT_PATH = '/content/dam';
consts.ASSETS_API_PATH = '/api/assets';

/**
 * primary types
 */
consts.DAM_ASSET = 'dam:Asset';

/**
 * attribute/property names
 */
consts.CLASS = 'class';
consts.ENTITIES = 'entities';
consts.PROPERTIES = 'properties';

consts.ASSET_SIZE = 'asset:size';
consts.ASSET_READONLY = 'asset:readonly';
consts.NAME = 'name';

/**
 * misc.
 */
consts.CLASS_FOLDER = 'assets/folder';
consts.CLASS_ASSET = 'assets/asset';

module.exports = consts;
