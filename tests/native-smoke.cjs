// Real native messaging protocol test. No mock downloads or generated progress.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dataRoot=path.resolve(process.env.QINGCUN_TEST_DATA || path.join(root,'test-results'));
fs.mkdirSync(dataRoot,{recursive:true});
if(!fs.existsSync(path.join(dataRoot,'state.json')))fs.writeFileSync(path.join(dataRoot,'state.json'),JSON.stringify({settings:{folder:path.join(dataRoot,'downloads'),cookies:''},jobs:[]}));
const proc=spawn(path.join(root,'helper/runtime/node.exe'),[path.join(root,'helper/host.cjs')],{windowsHide:true,env:{...process.env,QINGCUN_DATA:dataRoot},stdio:['pipe','pipe','pipe']});
let buffer=Buffer.alloc(0),seq=0,latest;const pending=new Map();const report={startedAt:new Date().toISOString(),checks:[],downloads:[]};
proc.stdout.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);while(buffer.length>=4){const size=buffer.readUInt32LE();if(buffer.length<size+4)return;const message=JSON.parse(buffer.subarray(4,size+4));buffer=buffer.subarray(size+4);if(message.event==='state')latest=message.data;const wait=pending.get(message.id);if(wait){pending.delete(message.id);clearTimeout(wait.timer);wait.resolve(message);}}});
proc.stderr.on('data',chunk=>process.stderr.write(chunk));
function request(command,data={}){return new Promise((resolve,reject)=>{const id=String(++seq);const timer=setTimeout(()=>{pending.delete(id);reject(new Error(command+' timed out'));},150000);pending.set(id,{resolve,timer});const body=Buffer.from(JSON.stringify({id,command,data}));const head=Buffer.alloc(4);head.writeUInt32LE(body.length);proc.stdin.write(Buffer.concat([head,body]));});}
async function call(command,data){const message=await request(command,data);if(message.error)throw new Error(message.error);return message.data;}
async function until(predicate,timeout=180000){const start=Date.now();while(Date.now()-start<timeout){if(predicate())return;await new Promise(r=>setTimeout(r,200));}throw new Error('等待真实任务完成超时');}
(async()=>{
 try{
  assert.ok((await call('hello')).settings.folder);report.checks.push('真实助手握手通过');
  for(const url of ['https://example.com/video','file:///C:/Windows/win.ini','https://youtube.com/watch?v=x','https://www.youtube.com.evil.test/watch?v=jNQXAC9IVRw'])assert.ok((await request('analyze',{url})).error);
  report.checks.push('非 YouTube / 本地文件 / 无效视频 URL 被拒绝');
  if(process.argv.includes('--download')){
   const url='https://www.youtube.com/watch?v=jNQXAC9IVRw';
   const info=await call('analyze',{url});assert.ok(info.formats.length);report.checks.push(`真实视频解析通过：${info.title}，${info.formats.length} 个视频格式`);
   const format=[...info.formats].sort((a,b)=>a.height-b.height || a.tbr-b.tbr)[0];
   for(const kind of ['video','audio']){
    const {jobId}=await call('download',{url,kind,formatId:format.id});
    await until(()=>latest?.jobs.some(j=>j.id===jobId && ['completed','failed'].includes(j.status)));
    const job=latest.jobs.find(j=>j.id===jobId);report.downloads.push({kind,status:job.status,file:job.file,error:job.error});
    assert.equal(job.status,'completed',job.error);assert.ok(fs.statSync(job.file).size>1000);
   }
   const {jobId}=await call('download',{url,kind:'video',formatId:format.id});
   await call('cancel',{jobId});await until(()=>latest?.jobs.some(j=>j.id===jobId && j.status==='cancelled'));
   report.checks.push('真实任务取消通过');
   await new Promise(r=>setTimeout(r,1500));
   await call('retry',{jobId});await until(()=>latest?.jobs.some(j=>j.id===jobId && ['completed','failed'].includes(j.status)));
   const retried=latest.jobs.find(j=>j.id===jobId);assert.equal(retried.status,'completed',retried.error);report.checks.push('已取消任务重试通过');
  }
  report.status='passed';
 }catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
 finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(dataRoot,'native-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));proc.stdin.end();}
})();
