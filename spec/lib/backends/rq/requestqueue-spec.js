/*
 * ADOBE CONFIDENTIAL
 * __________________
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
 */
 
 var testcommon = require('../../test-common');
 var requestqueue = require('../../../../lib/backends/rq/requestqueue');
 
 describe("RequestQueue", function() {
    var rq, common = null;
    var testName = 'file';
    var testDestName = 'file2';
    var testDestPath = '/queue2';
    var testPath = '/queue';
    var testFullPath = testPath + '/' + testName;
    var testFullDestPath = testDestPath + '/' + testDestName;
    var testLocalPrefix = '.';
    var testRemotePrefix = 'http://localhost:4502/api/assets';
    var testLocal = testLocalPrefix + testPath + '/' + testName;
    var testRemoteParent = testRemotePrefix + testPath;
    var testRemote = testRemoteParent + '/' + testName;
    var testDestLocal = testLocalPrefix + testDestPath + '/' + testDestName;
    var testDestRemote = testRemotePrefix + testDestPath + '/' + testDestName;

     var addRequestOptions = function (method, path, name, localPrefix, remotePrefix) {
         common.db.insert({
             method: method,
             path: path,
             name: name,
             localPrefix: localPrefix,
             remotePrefix: remotePrefix,
             timestamp: 12345,
             retries: 0
         });
     };

     var addRequest = function(method) {
        addRequestOptions(method, testPath, testName, testLocalPrefix, testRemotePrefix);
     };

    var addDestRequest = function(method) {
        addRequestOptions(method, testDestPath, testDestName, testLocalPrefix, testRemotePrefix);
    };
    
    var queueAndVerifyOptions = function(options, callback) {
        rq.queueRequest(options, function(err) {
            expect(err).toBeFalsy();
            common.db.find({}, function (e, results) {
                expect(e).toBeFalsy();
                callback(results);
            });
        });
    };

     var queueAndVerify = function(method, callback) {
         queueAndVerifyOptions({
             method: method,
             path: testFullPath,
             localPrefix: testLocalPrefix,
             remotePrefix: testRemotePrefix,
             destPath: testFullDestPath
         }, callback);
     };

    var queueAndVerifyReplace = function(oldMethod, newMethod, callback) {
        queueAndVerifyMethod(oldMethod, newMethod, newMethod, callback);
    };
    
    var queueAndVerifyNoReplace = function(oldMethod, newMethod, callback) {
        queueAndVerifyMethod(oldMethod, newMethod, oldMethod, callback);
    };
    
    var queueAndVerifyMethod = function(oldMethod, newMethod, resultMethod, callback) {
        queueAndVerify(oldMethod, function (results) {
            queueAndVerify(newMethod, function(results) {
                var hasResult = false;
                for (var i = 0; i < results.length; i++) {
                    if (results[i].method == resultMethod) {
                        hasResult = true;
                        break;
                    }
                }
                expect(hasResult).toEqual(true);
                callback(results);
            });
        });
    };

    var getDocPaths = function (doc, callback) {
        var localPath = doc.localPrefix + doc.path + '/' + doc.name;
        var remoteUrl = doc.remotePrefix + doc.path + '/' + doc.name;
        var localDestPath = null;
        var remoteDestUrl = null;
        if (doc.destPath) {
            localDestPath = doc.localPrefix + doc.destPath + '/' + doc.destName;
            remoteDestUrl = doc.remotePrefix + doc.destPath + '/' + doc.destName;
        }
        callback(localPath, remoteUrl, localDestPath, remoteDestUrl);
    };
    
    beforeEach(function() {
        common = new testcommon();

        rq = new requestqueue({db: common.db});
    });

    describe("GetRequests", function() {
        var testGetRequests = function(path, done) {
            addRequest('PUT');
            addDestRequest('POST');

            rq.getRequests(path, function(err, lookup) {
                expect(err).toBeUndefined();
                expect(common.db.find).toHaveBeenCalled();
                
                expect(lookup['file']).toEqual('PUT');
                
                done();
            });
        };
        
        it("testGetRequests", function(done) {
            testGetRequests(testPath, done);
        });
    
        it("testGetRequestsError", function(done) {
            common.db.find = function (options, callback) {
                callback('error!');
            };
            
            rq.getRequests(testPath, function(err, lookup) {
                expect(err).toEqual('error!');
                expect(lookup).toBeUndefined();
                done();
            });
        });
    });

     describe("IncrementRetryCount", function () {
         it("testIncrementRetryCount", function (done) {
             addRequest('PUT');
             rq.getProcessRequest(0, 3, function (err, req) {
                 expect(err).toBeFalsy();
                 var currRetries = req.retries;
                 rq.setRetryCount(req.path, req.name, currRetries + 1, function (err) {
                     expect(err).toBeFalsy();

                     rq.getProcessRequest(0, 3, function (err, req) {
                         expect(err).toBeFalsy();
                         expect(req.retries).toEqual(currRetries + 1);
                         done();
                     });
                 });
             });
         });
     });

     describe("RemoveRequest", function (){
         it("testRemoveRequest", function (done) {
             addRequest('PUT');
             rq.removeRequest(testPath, testName, function (err) {
                 expect(err).toBeFalsy();
                 done();
             });
         });

         it("testRemoveRequestError", function (done) {
             rq.removeRequest(testPath, testName, function (err) {
                 expect(err).toBeTruthy();
                 done();
             });
         });
     });

     describe("GetProcessRequest", function () {
         it("testGetProcessRequest", function (done) {
             addRequest('PUT');
             rq.getProcessRequest(0, 3, function (err, req) {
                 expect(err).toBeFalsy();
                 expect(req).toBeDefined();
                 expect(req.method).toEqual('PUT');
                 done();
             });
         });

         it("testGetProcessRequestUnexpired", function (done) {
             addRequest('PUT');
             rq.getProcessRequest(new Date().getTime(), 3, function (err, req) {
                 expect(err).toBeFalsy();
                 expect(req).toBeFalsy();
                 done();
             });
         });

         it("testGetProcessRequestMaxRetries", function (done) {
             addRequest('PUT');
             rq.getProcessRequest(0, 0, function (err, req) {
                 expect(err).toBeFalsy();
                 expect(req).toBeFalsy();
                 done();
             });
         });
     });

     describe("UpdatePath", function () {
         it("testUpdatePath", function (done) {
             addRequest('PUT');
             addRequestOptions('DELETE', testPath, testDestName, testLocalPrefix, testRemotePrefix);
             rq.updatePath(testPath, testDestPath, function (err) {
                 expect(err).toBeFalsy();
                 rq.getRequests(testDestPath, function (err, lookup) {
                     expect(err).toBeFalsy();
                     expect(lookup[testName]).toEqual('PUT');
                     expect(lookup[testDestName]).toEqual('DELETE');
                     done();
                 });
             });
         });

         it("testUpdatePathSub", function (done) {
             addRequestOptions('DELETE', testPath + '/sub', testName, testLocalPrefix, testRemotePrefix);
             rq.updatePath(testPath, testDestPath, function (err) {
                 expect(err).toBeFalsy();
                 rq.getRequests(testDestPath + '/sub', function (err, lookup) {
                     expect(err).toBeFalsy();
                     expect(lookup[testName]).toEqual('DELETE');
                     done();
                 });
             });
         });
     });

     describe("RemovePath", function () {
         it("testRemovePath", function (done) {
             addRequest('PUT');
             addRequest('DELETE', testPath, testDestName, testLocalPrefix, testRemotePrefix);
             rq.removePath(testPath, function (err) {
                 expect(err).toBeFalsy();
                 rq.getRequests(testPath, function (err, lookup) {
                     expect(err).toBeFalsy();
                     expect(lookup[testName]).toBeFalsy();
                     expect(lookup[testDestName]).toBeFalsy();
                     done();
                 });
             });
         });

         it("testRemotePathSub", function (done) {
             addRequestOptions('DELETE', testPath + '/sub', testName, testLocalPrefix, testRemotePrefix);
             rq.removePath(testPath, function (err) {
                 expect(err).toBeFalsy();
                 rq.getRequests(testPath + '/sub', function (err, lookup) {
                     expect(err).toBeFalsy();
                     expect(lookup[testName]).toBeFalsy();
                     done();
                 });
             });
         });
     });

     describe("CopyPath", function () {
         it("testCopyPath", function (done) {
             addRequest('PUT');
             addRequestOptions('DELETE', testPath, testDestName, testLocalPrefix, testRemotePrefix);
             rq.copyPath(testPath, testDestPath, function (err) {
                 expect(err).toBeFalsy();
                 rq.getRequests(testPath, function (err, lookup) {
                     expect(err).toBeFalsy();
                     expect(lookup[testName]).toEqual('PUT');
                     rq.getRequests(testDestPath, function (err, lookup) {
                         expect(err).toBeFalsy();
                         expect(lookup[testName]).toEqual('PUT');
                         expect(lookup[testDestName]).toEqual('DELETE');
                         done();
                     });
                 });
             });
         });

         it("testCopyPathSub", function (done) {
             addRequestOptions('PUT', testPath + '/sub', testName, testLocalPrefix, testRemotePrefix);
             rq.copyPath(testPath, testDestPath, function (err) {
                 expect(err).toBeFalsy();
                 rq.getRequests(testDestPath + '/sub', function (err, lookup) {
                     expect(err).toBeFalsy();
                     expect(lookup[testName]).toEqual('PUT');
                     rq.getRequests(testPath + '/sub', function (err, lookup) {
                         expect(err).toBeFalsy();
                         expect(lookup[testName]).toEqual('PUT');
                         done();
                     });
                 });
             });
         });
     });
    
    describe("QueueRequest", function() {
        it("testQueueRequestDelete", function(done) {
            queueAndVerify('DELETE', function(results) {
                expect(results.length).toEqual(1);
                expect(results[0].method).toEqual('DELETE');
                expect(results[0].name).toEqual(testName);
                expect(results[0].path).toEqual(testPath);
                expect(results[0].timestamp).not.toBeUndefined();
                expect(results[0].localPrefix).toEqual(testLocalPrefix);
                expect(results[0].remotePrefix).toEqual(testRemotePrefix);
                done();
            });
        });
        
        it("testQueueRequestDeletePut", function(done) {
            addRequest('PUT');
            queueAndVerify('DELETE', function(results) {
                expect(results.length).toEqual(0);
                done();
            });
        });
        
        it("testQueueRequestDeletePost", function(done) {
            queueAndVerifyReplace('POST', 'DELETE', function(results) {
                done();
            });
        });
        
        it("testQueueRequestDeleteMove", function(done) {
            queueAndVerifyReplace('MOVE', 'DELETE', function(results) {
                var valid = false;
                for (var i = 0; i < results.length; i++) {
                    if (results[i].method == 'DELETE') {
                        valid = (results[i].path == testPath && results[i].name == testName);
                        break;
                    }
                }
                expect(valid).toEqual(true);
                done();
            });
        });
        
        it("testQueueRequestDeleteCopy", function(done) {
            queueAndVerifyReplace('COPY', 'DELETE', function(results) {
                expect(results.length).toEqual(2);
                var put = 0;
                var del = 1;
                if (results[1].method == 'PUT') {
                    put = 1;
                    del = 0;
                }
                expect(results[put].method).toEqual('PUT');
                expect(results[put].path).toEqual(testDestPath);
                expect(results[put].name).toEqual(testDestName);
                expect(results[del].method).toEqual('DELETE');
                expect(results[del].path).toEqual(testPath);
                expect(results[del].name).toEqual(testName);
                done();
            });
        });
        
        it("testQueueRequestDeleteDelete", function(done) {
            queueAndVerifyReplace('DELETE', 'DELETE', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPut", function(done) {
            queueAndVerify('PUT', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPutPut", function(done) {
            queueAndVerifyReplace('PUT', 'PUT', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPutPost", function(done) {
            queueAndVerifyNoReplace('POST', 'PUT', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPutMove", function(done) {
            // move was previously queued. should result in an update of the
            // original asset (which would have been deleted otherwise) and
            // a PUT to the new location
            queueAndVerifyMethod('MOVE', 'PUT', 'POST', function(docs) {
                var verified = false;
                for (var i = 0; i < docs.length; i++) {
                    if (docs[i].path == testDestPath && docs[i].name == testDestName) {
                        expect(docs[i].method).toEqual('PUT');
                        verified = true;
                    }
                }
                expect(verified).toEqual(true);
                done();
            });
        });
        
        it("testQueueRequestPutCopy", function(done) {
            // this should actually probably result in some sort of error state.
            // if a file was copied previously, then there shouldn't be a PUT
            // as a valid next request. However, verify the case anyway
            queueAndVerifyMethod('COPY', 'PUT', 'PUT', function(docs) {
                var verified = false;
                for (var i = 0; i < docs.length; i++) {
                    if (docs[i].path == testDestPath && docs[i].name == testDestName) {
                        expect(docs[i].method).toEqual('PUT');
                        verified = true;
                    }
                }
                expect(verified).toEqual(true);
                done();
            });
        });
        
        it("testQueueRequestPutDelete", function(done) {
            queueAndVerifyReplace('DELETE', 'POST', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPost", function(done) {
            queueAndVerify('POST', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPostPut", function(done) {
            queueAndVerifyNoReplace('PUT', 'POST', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPostPost", function(done) {
            queueAndVerifyReplace('POST', 'POST', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPostMove", function(done) {
            queueAndVerifyMethod('MOVE', 'POST', 'POST', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPostCopy", function(done) {
            queueAndVerifyMethod('COPY', 'POST', 'POST', function(results) {
                done();
            });
        });
        
        it("testQueueRequestPostDelete", function(done) {
            queueAndVerifyReplace('DELETE', 'POST', function(results) {
                done();
            });
        });
        
        it("testQueueRequestMove", function(done) {
            queueAndVerify('MOVE', function(docs) {
                expect(docs.length).toEqual(2);
                var put = docs[0];
                var del = docs[1];

                if (put.method == 'DELETE') {
                    put = docs[1];
                    del = docs[0];
                }
                expect(put.method).toEqual('PUT');
                expect(put.path).toEqual(testDestPath);
                expect(put.name).toEqual(testDestName);
                expect(put.timestamp).not.toBeUndefined();

                expect(del.method).toEqual('DELETE');
                expect(del.path).toEqual(testPath);
                expect(del.name).toEqual(testName);
                expect(put.timestamp).not.toBeUndefined();

                done();
            });
        });
        
        it("testQueueRequestMovePut", function(done) {
            queueAndVerifyMethod('MOVE', 'PUT', 'POST', function(docs) {
                expect(docs.length).toEqual(2);
                var verified = false;
                for (var i = 0; i < docs.length; i++) {
                    if (docs[i].path == testDestPath && docs[i].name == testDestName) {
                        expect(docs[i].method).toEqual('PUT');
                        verified = true;
                    }
                }
                expect(verified).toEqual(true);
                done();
            });
        });
        
        it("testQueueRequestMovePost", function(done) {
            queueAndVerifyReplace('MOVE', 'POST', function(docs) {
                expect(docs.length).toEqual(2);
                done();
            });
        });
        
        it("testQueueRequestMoveMove", function(done) {
            queueAndVerifyMethod('MOVE', 'MOVE', 'DELETE', function(docs) {
                expect(docs.length).toEqual(2);
                done();
            });
        });
        
        it("testQueueRequestMoveCopy", function(done) {
            queueAndVerifyMethod('COPY', 'MOVE', 'DELETE', function(docs) {
                expect(docs.length).toEqual(2);
                done();
            });
        });
        
        it("testQueueRequestMoveDelete", function(done) {
            queueAndVerifyMethod('DELETE', 'MOVE', 'DELETE', function(docs) {
                expect(docs.length).toEqual(2);
                done();
            });
        });
        
        it("testQueueRequestCopy", function(done) {
            queueAndVerify('COPY', function(docs) {
                expect(docs.length).toEqual(1);
                expect(docs[0].method).toEqual('PUT');
                expect(docs[0].path).toEqual(testDestPath);
                expect(docs[0].name).toEqual(testDestName);
                expect(docs[0].timestamp).not.toBeUndefined();
                done();
            });
        });
        
        it("testQueueRequestCopyPut", function(done) {
            queueAndVerifyNoReplace('PUT', 'COPY', function(docs) {
                expect(docs.length).toEqual(2);
                var local = false;
                var dest = false;
                for (var i = 0; i < docs.length; i++) {
                    if (docs[i].path == testDestPath && docs[i].name == testDestName) {
                        dest = true;
                    } else if (docs[i].path == testPath && docs[i].name == testName) {
                        local = true;
                    }
                }
                expect(dest).toEqual(true);
                expect(local).toEqual(true);
                done();
            });
        });
        
        it("testQueueRequestCopyPost", function(done) {
            queueAndVerifyNoReplace('POST', 'COPY', function(docs) {
                expect(docs.length).toEqual(2);
                getDocPaths(docs[0], function (localPath1, remoteUrl1) {
                    getDocPaths(docs[1], function (localPath2, remoteUrl2) {
                        var method1 = docs[0].method;
                        var method2 = docs[1].method;
                        if (docs[0].method == 'POST') {
                            var tmp = localPath1;
                            localPath1 = localPath2;
                            localPath2 = tmp;
                            tmp = remoteUrl1;
                            remoteUrl1 = remoteUrl2;
                            remoteUrl2 = tmp;
                            tmp = method1;
                            method1 = method2;
                            method2 = tmp;
                        }
                        expect(method1).toEqual('PUT');
                        expect(method2).toEqual('POST');
                        expect(localPath1).toEqual(testDestLocal);
                        expect(remoteUrl1).toEqual(testDestRemote);
                        expect(localPath2).toEqual(testLocal);
                        expect(remoteUrl2).toEqual(testRemote);
                        done();
                    });
                });
            });
        });
        
        it("testQueueRequestCopyMove", function(done) {
            // technically this should never happen, but if it did it would
            // result in no change to the move
            queueAndVerifyMethod('MOVE', 'COPY', 'DELETE', function(docs) {
                expect(docs.length).toEqual(2);
                done();
            });
        });
        
        it("testQueueRequestCopyCopy", function(done) {
            queueAndVerify('COPY', function(docs) {
                queueAndVerify('COPY', function(docs) {
                    expect(docs.length).toEqual(1);
                    expect(docs[0].method).toEqual('PUT');
                    getDocPaths(docs[0], function (localPath, remoteUrl) {
                        expect(localPath).toEqual(testDestLocal);
                        expect(remoteUrl).toEqual(testDestRemote);
                        done();
                    });
                });
            });
        });
        
        it("testQueueRequestCopyDelete", function(done) {
            // technically this should never happen, but it would end up
            // as a move
            queueAndVerifyNoReplace('DELETE', 'COPY', function(docs) {
                expect(docs.length).toEqual(2);
                done();
            });
        });
/*
        describe("testQueueRequestFolder", function() {
            it("testQueueRequestFolderPut", function (done) {
                queueAndVerifyFolder('PUT', function (docs) {
                    expect(docs.length).toEqual(1);
                    expect(docs[0].method).toEqual('PUT');
                    expect(docs[0].localPath).toEqual(testLocal);
                    expect(docs[0].remoteUrl).toEqual(testRemote);
                    expect(docs[0].destPath).toBeUndefined();
                    expect(docs[0].isFolder).toBeTruthy();
                    done();
                });
            });

            it("testQueueRequestFolderMove", function(done) {
                queueAndVerifyFolder('MOVE', function (docs) {
                    expect(docs.length).toEqual(1);
                    expect(docs[0].method).toEqual('MOVE');
                    expect(docs[0].localPath).toEqual(testLocal);
                    expect(docs[0].remoteUrl).toEqual(testRemote);
                    expect(docs[0].destPath).toEqual(testDestLocal);
                    expect(docs[0].destUrl).toEqual(testDestRemote);
                    expect(docs[0].isFolder).toBeTruthy();
                    done();
                });
            });


            it("testQueueRequestFolderMoveDeleteDest", function(done) {
                // if a folder is moved and then the destination is deleted, the original folder should just be deleted
                queueAndVerifyFolder('MOVE', function (docs) {
                    queueAndVerifyOptions({
                        method: 'DELETE',
                        localFile: testDestLocal,
                        remoteFile: testDestRemote
                    }, function(docs) {
                        expect(docs.length).toEqual(1);
                        expect(docs[0].method).toEqual('DELETE');
                        expect(docs[0].localPath).toEqual(testLocal);
                        expect(docs[0].remoteUrl).toEqual(testRemote);
                        expect(docs[0].destPath).toBeUndefined();
                        done();
                    });
                });
            });

            it("testQueueRequestFolderMoveMoveDest", function(done) {
                // if a folder is moved and then the destination is moved again, the original folder should just be moved
                // to the new destination
                queueAndVerifyFolder('MOVE', function (docs) {
                    queueAndVerifyOptions({
                        method: 'MOVE',
                        localFile: testDestLocal,
                        remoteFile: testDestRemote,
                        destLocalFile: testDestLocal + '3',
                        destRemoteFile: testDestRemote + '3',
                        isFolder: true
                    }, function (docs) {
                        expect(docs.length).toEqual(1);
                        expect(docs[0].method).toEqual('MOVE');
                        expect(docs[0].localPath).toEqual(testLocal);
                        expect(docs[0].remoteUrl).toEqual(testRemote);
                        expect(docs[0].destPath).toEqual(testDestLocal + '3');
                        expect(docs[0].destUrl).toEqual(testDestRemote + '3');
                        expect(docs[0].isFolder).toBeTruthy();
                        done();
                    });
                });
            });

            it("testQueueRequestFolderPutMove", function (done) {
                // if a folder is put and then moved, the put needs to be changed to the destination path
                queueAndVerifyFolder('PUT', function (docs) {
                    queueAndVerifyFolder('MOVE', function (docs) {
                        expect(docs.length).toEqual(1);
                        expect(docs[0].method).toEqual('PUT');
                        expect(docs[0].localPath).toEqual(testDestLocal);
                        expect(docs[0].remoteUrl).toEqual(testDestRemote);
                        expect(docs[0].destPath).toBeFalsy();
                        expect(docs[0].destUrl).toBeFalsy();
                        expect(docs[0].isFolder).toBeTruthy();
                        done();
                    });
                });
            });

            it("testQueueRequestFolderPutCopy", function (done) {
                // if a folder is put and then copied, a put for the new folder needs to be added
                queueAndVerifyFolder('PUT', function (docs) {
                    queueAndVerifyFolder('COPY', function (docs) {
                        expect(docs.length).toEqual(2);
                        var hasLocal = false;
                        var hasDest = false;
                        for (var i = 0; i < docs.length; i++) {
                            var lPath = null;
                            var rPath = null;
                            if (docs[i].localPath == testDestLocal) {
                                hasDest = true;
                                lPath = testDestLocal;
                                rPath = testDestRemote;
                            } else if (docs[i].localPath == testLocal) {
                                hasLocal = true;
                                lPath = testLocal;
                                rPath = testRemote;
                            }
                            expect(docs[i].method).toEqual('PUT');
                            expect(docs[i].localPath).toEqual(lPath);
                            expect(docs[i].remoteUrl).toEqual(rPath);
                            expect(docs[i].destPath).toBeFalsy();
                            expect(docs[i].destUrl).toBeFalsy();
                            expect(docs[i].isFolder).toBeTruthy();
                        }
                        expect(hasLocal).toBeTruthy();
                        expect(hasDest).toBeTruthy();
                        done();
                    });
                });
            });

            it("testQueueRequestFolderMovePut", function(done) {
                // if a folder is moved and then re-created, there needs to be two actions done on the folder: the move
                // and then a put
                queueAndVerifyFolder('MOVE', function (docs){
                    queueAndVerifyFolder('PUT', function (docs) {
                        expect(docs.length).toEqual(1);
                        expect(docs[0].method).toEqual('MOVE');
                        expect(docs[0].localPath).toEqual(testLocal);
                        expect(docs[0].remoteUrl).toEqual(testRemote);
                        expect(docs[0].destPath).toEqual(testDestLocal);
                        expect(docs[0].destUrl).toEqual(testDestRemote);
                        expect(docs[0].isFolder).toBeTruthy();
                        expect(docs[0].method2).toEqual('PUT');
                        done();
                    });
                });
            });

            it("testQueueRequestFolderCopy", function(done) {
                queueAndVerifyFolder('COPY', function (docs) {
                    expect(docs.length).toEqual(1);
                    expect(docs[0].method).toEqual('COPY');
                    expect(docs[0].localPath).toEqual(testLocal);
                    expect(docs[0].remoteUrl).toEqual(testRemote);
                    expect(docs[0].destPath).toEqual(testDestLocal);
                    expect(docs[0].destUrl).toEqual(testDestRemote);
                    expect(docs[0].isFolder).toBeTruthy();
                    done();
                });
            });

            it("testQueueRequestFolderCopyDeleteDest", function(done) {
                // if a folder is copied and then the destination folder is deleted, the copy method should be removed
                queueAndVerifyFolder('COPY', function (docs) {
                    queueAndVerifyOptions({
                        method: 'DELETE',
                        localFile: testDestLocal,
                        remoteFile: testDestRemote
                    }, function (docs) {
                        expect(docs.length).toEqual(0);
                        done();
                    });
                });
            });

            it("testQueueRequestFolderCopyDelete", function(done) {
                // if a folder is copied and then the original deleted, it should be changed to a MOVE
                queueAndVerifyFolder('COPY', function (docs) {
                    queueAndVerify('DELETE', function (docs) {
                        expect(docs.length).toEqual(1);
                        expect(docs[0].method).toEqual('MOVE');
                        expect(docs[0].localPath).toEqual(testLocal);
                        expect(docs[0].remoteUrl).toEqual(testRemote);
                        expect(docs[0].destPath).toEqual(testDestLocal);
                        expect(docs[0].destUrl).toEqual(testDestRemote);
                        expect(docs[0].isFolder).toBeTruthy();
                        done();
                    });
                });
            });
        });
        */
    });
 });
 