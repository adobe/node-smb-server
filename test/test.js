var net = require( 'net' );
const { Buffer } = require('buffer');
const assert = require('assert');
require('../index')

describe('packet test', () => {
    it('android packet', (done) => {
        try {

            const host = '127.0.0.1';
            const config = JSON.parse(require('fs').readFileSync(__dirname+'/../config.json'));
            const port = config.listen.port
            const client_test_data=require('./packet_test_data')
            
            function asyncwrite(buf){
                if(buf===undefined){
                    client.close()
                    done()
                }
                return new Promise((resolve, reject) => {
                    client.write(Buffer.from(buf),err=>{
                        if(err)reject(err);
                        resolve(asyncwrite);
                    })
                });
            }            
            const client = new net.Socket();
            client.connect( port, host, async()=>{
                client_test_data.reduce((acc,cur,idx)=>{
                    if(idx==0)return asyncwrite(cur)
                    return acc.then(asyncwrite(cur))
                },null)
            });        

        } catch (error) {
            done(error)
        }
    });
});
