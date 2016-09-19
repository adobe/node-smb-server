/*
 *  Copyright 2016 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

var RQCommon = require('./rq-common');

describe('WorkTree', function () {
    var c;

    beforeEach(function () {
        c = new RQCommon();

        spyOn(c.remoteTree, 'list').andCallThrough();
    });

    describe('CreateFile', function () {
        it('testCreateFile', function (done) {
            c.workTree.createFile('/file', function (err, file) {
                expect(err).toBeFalsy();
                c.expectLocalFileExistExt('/file', false, true, true, done);
            });
        });

        it('testCreateFileTemp', function (done) {
            c.workTree.createFile('/.temp', function (err, file) {
                expect(err).toBeFalsy();
                c.expectLocalFileExist('/.temp', false, false, done);
            });
        });

        it('testCreateFileExisting', function (done) {
            c.workTree.createFileExisting('/file', function (err, file) {
                expect(err).toBeFalsy();
                c.expectLocalFileExistExt('/file', false, true, false, done);
            });
        });

        it('testCreateFileExistingTemp', function (done) {
            c.workTree.createFileExisting('/.temp', function (err, file) {
                expect(err).toBeFalsy();
                c.expectLocalFileExist('/.temp', false, false, done);
            });
        });
    });

    describe('Rename', function () {
        it('testRename', function (done) {
            c.workTree.createFile('/file', function (err, file) {
                expect(err).toBeFalsy();
                c.workTree.rename('/file', '/file2', function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExistExt('/file2', false, true, true, function () {
                        c.expectLocalFileExist('/file', false, false, done);
                    });
                });
            });
        });

        it('testRenameExisting', function (done) {
            c.workTree.createFileExisting('/file', function (err, file) {
                expect(err).toBeFalsy();
                c.workTree.rename('/file', '/file2', function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExistExt('/file2', false, true, true, function () {
                        c.expectLocalFileExist('/file', false, false, done);
                    });
                });
            });
        });

        it('testRenameTempFile', function (done) {
            c.workTree.rename('/.temp', '/.temp2', function (err) {
                expect(err).toBeFalsy();
                c.expectLocalFileExist('/.temp2', false, false, function () {
                    c.expectLocalFileExist('/.temp', false, false, done);
                });
            });
        });

        it('testRenameTempToReal', function (done) {
            c.workTree.rename('/.temp', '/file', function (err) {
                expect(err).toBeFalsy();
                c.expectLocalFileExist('/.temp', false, false, function () {
                    c.expectLocalFileExistExt('/file', false, true, true, done);
                });
            });
        });

        it('testRenameRealToTemp', function (done) {
            c.workTree.createFile('/file', function (err, file) {
                expect(err).toBeFalsy();
                c.workTree.rename('/file', '/.temp', function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExist('/file', false, false, function () {
                        c.expectLocalFileExist('/.temp', false, false, done);
                    });
                });
            });
        });
    });

    describe('Delete', function () {
        it('testDelete', function (done) {
            c.addQueuedFile('/testfile', function (file) {
                c.workTree.delete('/testfile', function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExistExt('/testfile', true, false, false, done);
                });
            });
        });

        it('testDeleteExisting', function (done) {
            c.workTree.createFileExisting('/testfile', function (err, file) {
                expect(err).toBeFalsy();
                c.workTree.delete('/testfile', function (err) {
                    expect(err).toBeFalsy();
                    c.expectLocalFileExistExt('/testfile', false, false, false, done);
                });
            });
        });

        it('testDeleteTemp', function (done) {
            c.workTree.delete('/.temp', function (err) {
                expect(err).toBeFalsy();
                c.expectLocalFileExist('/.temp', false, false, done);
            });
        });
    });
});
