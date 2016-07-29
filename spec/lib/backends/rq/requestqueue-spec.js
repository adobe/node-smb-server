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
    var testLocal = './local/file';
    var testRemote = '/remote/file';
    var testRemoteParent = '/remote';
    var testDestLocal = './local/file2';
    var testDestRemote = '/remote/file2';
    
    var addRequest = function(method) {
        common.db.insert({
            method: method,
            localPath: testLocal,
            remoteUrl: testRemote,
            parentRemoteUrl: testRemoteParent,
            timestamp: 12345,
            contentType: 'text/plain',
            contentLength: 1234
        });
    };
    
    var addDestRequest = function(method) {
        common.db.insert({
            method: method,
            localPath: testDestLocal,
            remoteUrl: testDestRemote,
            parentRemoteUrl: testRemoteParent,
            timestamp: 12345,
            contentType: 'text/plain',
            contentLength: 1234
        });
    };
    
    var queueAndVerify = function(method, callback) {
        rq.queueRequest({
            method: method,
            localFile: testLocal,
            remoteFile: testRemote,
            destLocalFile: testDestLocal,
            destRemoteFile: testDestRemote
        }, function(err) {
            expect(err).toBeUndefined();
            common.db.find({localPath: testLocal}, function (e, results) {
                expect(e).toBeFalsy();
                callback(results);
            });
        });
    };
    
    var queueAndVerifyReplace = function(oldMethod, newMethod, callback) {
        queueAndVerifyMethod(oldMethod, newMethod, newMethod, callback);
    };
    
    var queueAndVerifyNoReplace = function(oldMethod, newMethod, callback) {
        queueAndVerifyMethod(oldMethod, newMethod, oldMethod, callback);
    };
    
    var queueAndVerifyMethod = function(oldMethod, newMethod, resultMethod, callback) {
        rq.queueRequest({
            method: oldMethod,
            localFile: testLocal,
            remoteFile: testRemote,
            destLocalFile: testDestLocal,
            destRemoteFile: testDestRemote
        }, function(err) {
            queueAndVerify(newMethod, function(results) {
                expect(results.length).toEqual(1);
                expect(results[0].method).toEqual(resultMethod);
                callback(results);
            });
        });
    };
    
    beforeEach(function() {
        common = new testcommon();

        rq = new requestqueue({db: common.db, log: common.log});
    });

    describe("GetRequests", function() {
        var testGetRequests = function(remoteDirUrl, done) {
            common.db.insert({
                method: 'PUT',
                parentRemoteUrl: 'http://localhost:4502/content/dam',
                remoteUrl: 'http://localhost:4502/content/dam/file',
                timestamp: 12345,
                contentType: 'text/plain',
                contentLength: 1234
            });
            common.db.insert({
                method: 'POST',
                parentRemoteUrl: 'http://localhost:4502/content/dam',
                remoteUrl: 'http://localhost:4502/content/dam/file2',
                timestamp: 54321,
                contentType: 'image/jpeg',
                contentLength: 4321
            });
            
            rq.getRequests(remoteDirUrl, function(err, lookup) {
                expect(err).toBeUndefined();
                expect(common.db.find).toHaveBeenCalled();
                
                expect(lookup['http://localhost:4502/content/dam/file2']).toEqual('POST');
                expect(lookup['http://localhost:4502/content/dam/file']).toEqual('PUT');
                
                done();
            });
        };
        
        it("testGetRequests", function(done) {
            testGetRequests('http://localhost:4502/content/dam/', done);
        });
    
        it("testGetRequestsNoSlash", function(done) {
            testGetRequests('http://localhost:4502/content/dam', done);
        });
        
        it("testGetRequestsError", function(done) {
            common.db.find = function (options, callback) {
                callback('error!');
            };
            
            rq.getRequests('http://localhost:4502/content/dam', function(err, lookup) {
                expect(err).toEqual('error!');
                expect(lookup).toBeUndefined();
                done();
            });
        });
    });
    
    ddescribe("QueueRequest", function() {
        it("testQueueRequestDelete", function(done) {
            queueAndVerify('DELETE', function(results) {
                expect(results.length).toEqual(1);
                expect(results[0].method).toEqual('DELETE');
                expect(results[0].localPath).toEqual(testLocal);
                expect(results[0].remoteUrl).toEqual(testRemote);
                expect(results[0].timestamp).not.toBeUndefined();
                expect(results[0].parentRemoteUrl).toEqual(testRemoteParent);
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
                expect(results[0].localPath).toEqual(testLocal);
                done();
            });
        });
        
        it("testQueueRequestDeleteCopy", function(done) {
            queueAndVerifyReplace('COPY', 'DELETE', function(results) {
                expect(results[0].localPath).toEqual(testLocal);
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
            queueAndVerifyMethod('MOVE', 'PUT', 'POST', function(results) {
                var verified = false;
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    console.log(docs);
                    for (var i = 0; i < docs.length; i++) {
                        if (docs[i].localPath == testDestLocal) {
                            expect(docs[i].method).toEqual('PUT');
                            verified = true;
                        }
                    }
                    expect(verified).toEqual(true);
                    done();
                });
            });
        });
        
        it("testQueueRequestPutCopy", function(done) {
            // this should actually probably result in some sort of error state.
            // if a file was copied previously, then there shouldn't be a PUT
            // as a valid next request. However, verify the case anyway
            queueAndVerifyMethod('COPY', 'PUT', 'PUT', function(results) {
                var verified = false;
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    for (var i = 0; i < docs.length; i++) {
                        if (docs[i].localPath == testDestLocal) {
                            expect(docs[i].method).toEqual('PUT');
                            verified = true;
                        }
                    }
                    expect(verified).toEqual(true);
                    done();
                });
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
            queueAndVerify('MOVE', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    var put = docs[0];
                    var del = docs[1];

                    if (put.method == 'DELETE') {
                        put = docs[1];
                        del = docs[0];
                    }
                    expect(put.method).toEqual('PUT');
                    expect(put.localPath).toEqual(testDestLocal);
                    expect(put.remoteUrl).toEqual(testDestRemote);
                    expect(put.timestamp).not.toBeUndefined();

                    expect(del.method).toEqual('DELETE');
                    expect(del.localPath).toEqual(testLocal);
                    expect(del.remoteUrl).toEqual(testRemote);
                    expect(put.timestamp).not.toBeUndefined();

                    done();
                });
            });
        });
        
        it("testQueueRequestMovePut", function(done) {
            queueAndVerifyMethod('MOVE', 'PUT', 'POST', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    var verified = false;
                    for (var i = 0; i < docs.length; i++) {
                        if (docs[i].localPath == testDestLocal) {
                            expect(docs[i].method).toEqual('PUT');
                            verified = true;
                        }
                    }
                    expect(verified).toEqual(true);
                    done();
                });
            });
        });
        
        it("testQueueRequestMovePost", function(done) {
            queueAndVerifyReplace('MOVE', 'POST', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    done();
                });
            });
        });
        
        it("testQueueRequestMoveMove", function(done) {
            queueAndVerifyMethod('MOVE', 'MOVE', 'DELETE', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    done();
                });
            });
        });
        
        it("testQueueRequestMoveCopy", function(done) {
            queueAndVerifyMethod('COPY', 'MOVE', 'DELETE', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    done();
                });
            });
        });
        
        it("testQueueRequestMoveDelete", function(done) {
            queueAndVerifyMethod('DELETE', 'MOVE', 'DELETE', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    done();
                });
            });
        });
        
        it("testQueueRequestCopy", function(done) {
            queueAndVerify('COPY', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(1);
                    expect(docs[0].method).toEqual('PUT');
                    expect(docs[0].remoteUrl).toEqual(testDestRemote);
                    expect(docs[0].timestamp).not.toBeUndefined();
                    done();
                });
            });
        });
        
        it("testQueueRequestCopyPut", function(done) {
            queueAndVerifyNoReplace('PUT', 'COPY', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    var local = false;
                    var dest = false;
                    for (var i = 0; i < docs.length; i++) {
                        if (docs[i].localPath == testDestLocal) {
                            dest = true;
                            expect(docs[i].remoteUrl).toEqual(testDestRemote);
                        } else if (docs[i].localPath == testLocal) {
                            local = true;
                            expect(docs[i].remoteUrl).toEqual(testRemote);
                        }
                    }
                    expect(dest).toEqual(true);
                    expect(local).toEqual(true);
                    done();
                });
            });
        });
        
        it("testQueueRequestCopyPost", function(done) {
            queueAndVerifyNoReplace('POST', 'COPY', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    var local = false;
                    var dest = false;
                    for (var i = 0; i < docs.length; i++) {
                        if (docs[i].method == 'POST') {
                            expect(docs[i].localPath).toEqual(testLocal);
                            expect(docs[i].remoteUrl).toEqual(testRemote);
                            local = true;
                        } else if (docs[i].method == 'PUT') {
                            expect(docs[i].localPath).toEqual(testDestLocal);
                            expect(docs[i].remoteUrl).toEqual(testDestRemote);
                            dest = true;
                        }
                    }
                    expect(local).toEqual(true);
                    expect(dest).toEqual(true);
                    done();
                });
            });
        });
        
        it("testQueueRequestCopyMove", function(done) {
            // technically this should never happen, but if it did it would
            // result in no change to the move
            queueAndVerifyMethod('MOVE', 'COPY', 'DELETE', function(results) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    done();
                });
            });
        });
        
        it("testQueueRequestCopyCopy", function(done) {
            queueAndVerify('COPY', function(err) {
                queueAndVerify('COPY', function(err) {
                    common.db.find({}, function (err, docs) {
                        expect(err).toBeFalsy();
                        expect(docs.length).toEqual(1);
                        expect(docs[0].method).toEqual('PUT');
                        expect(docs[0].localPath).toEqual(testDestLocal);
                        expect(docs[0].remoteUrl).toEqual(testDestRemote);
                        done();
                    });
                });
            });
        });
        
        it("testQueueRequestCopyDelete", function(done) {
            // technically this should never happen, but it would end up
            // as a move
            queueAndVerifyNoReplace('DELETE', 'COPY', function(err) {
                common.db.find({}, function (err, docs) {
                    expect(err).toBeFalsy();
                    expect(docs.length).toEqual(2);
                    done();
                });
            });
        });
    });
 });
 