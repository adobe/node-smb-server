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
 * named pipes
 */
consts.SAMR = '/samr';  // Security Account Manager (SAM) Remote Protocol
consts.SRVSVC = '/srvsvc';  // Server Service
consts.LSARPC = '/lsarpc';  // Local Security Authority
consts.WINREG = '/winreg';  // Windows Registry
consts.MDSSVC = '/mdssvc';  // Spotlight RPC Service

module.exports = consts;
