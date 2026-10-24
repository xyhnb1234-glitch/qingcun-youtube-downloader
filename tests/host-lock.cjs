const {spawn}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const data=path.resolve(process.env.QINGCUN_TEST_DATA || path.join(root,'lock-test-results'));
function start(){
 const proc=spawn(path.join(root,'helper/runtime/node.exe'),[path.join(root,'helper/host.cjs')],{windowsHide:true,env:{...process.env,QINGCUN_DATA:data},stdio:['pipe','pipe','inherit']});
 let buf=Buffer.alloc(0),resolve;
 proc.stdout.on('data',chunk=>{buf=Buffer.concat([buf,chunk]);while(buf.length>=4 && buf.length>=4+buf.readUInt32LE()){const len=buf.readUInt32LE();const message=JSON.parse(buf.subarray(4,len+4));buf=buf.subarray(len+4);if(message.id)resolve(message);}});
 return {proc,hello:()=>new Promise(done=>{resolve=done;const b=Buffer.from(JSON.stringify({id:'hello',command:'hello'}));const h=Buffer.alloc(4);h.writeUInt32LE(b.length);proc.stdin.write(Buffer.concat([h,b]));})};
}
(async()=>{const a=start(),b=start();const timer=setTimeout(()=>{a.proc.kill();b.proc.kill();process.exit(1);},15000);try{
 const first=await a.hello(),second=await b.hello();
 // Either host may win the startup race.
 const owner=first.data?a:b,other=first.data?b:a;
 assert.ok(first.data || second.data);assert.ok(first.error || second.error);
 await new Promise(done=>{owner.proc.once('exit',done);owner.proc.stdin.end();});
 assert.ok((await other.hello()).data);
 console.log('PASS: concurrent hosts blocked; second host reconnects after owner exits');
 }finally{clearTimeout(timer);a.proc.stdin.end();b.proc.stdin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
