// Isolated task-state tests. Fixtures never run or simulate media downloads.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const testRoot=path.join(root,'test-results');fs.mkdirSync(testRoot,{recursive:true});
const data=fs.mkdtempSync(path.join(testRoot,'task-actions-'));
const file=path.join(data,'retained-file.txt');fs.writeFileSync(file,'task test fixture');
const source=fs.readFileSync(path.join(root,'helper/host.cjs'),'utf8').split('\nacquireLock();')[0];
function load(){
  const context=vm.createContext({require,__dirname:path.join(root,'helper'),Buffer,URL,setTimeout,clearTimeout,
    process:{env:{...process.env,QINGCUN_DATA:data},stdout:{write(){}},platform:process.platform}});
  vm.runInContext(source+'\nglobalThis.api={handle,state,rejectDuplicate,analyses,setActive:job=>{active=job?{job,proc:null}:null},getActive:()=>active};',context);
  return context.api;
}
(async()=>{try{
  let api=load();
  const completed={id:'done',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',kind:'video',formatId:'18',status:'completed',file};
  api.state.jobs.push(completed);
  await api.handle('deleteJob',{jobId:'done'});
  assert.equal(api.state.jobs.length,0);assert.ok(fs.existsSync(file));
  assert.throws(()=>api.rejectDuplicate(completed),/已下载/);
  api=load();assert.equal(api.state.jobs.length,0);
  assert.throws(()=>api.rejectDuplicate(completed),/已下载/);
  api.rejectDuplicate({...completed,formatId:'22'});api.rejectDuplicate({...completed,kind:'audio'});
  api.analyses.set(completed.url,{at:Date.now(),result:{title:'fixture',formats:[{id:'18'}]}});
  await assert.rejects(api.handle('download',{url:completed.url,kind:'video',formatId:'18'}),/已下载/);
  fs.unlinkSync(file);api.rejectDuplicate(completed);
  const active={...completed,id:'active',status:'downloading'};
  const queued={...completed,id:'queued',status:'queued'};
  api.state.jobs.push(active,queued);api.setActive(active);
  assert.throws(()=>api.rejectDuplicate(completed),/队列/);
  await api.handle('deleteJob',{jobId:'queued'});assert.equal(api.state.jobs.length,1);
  await api.handle('deleteJob',{jobId:'active'});assert.equal(active.status,'cancelled');
  assert.equal(api.state.jobs.length,0);assert.ok(api.getActive(),'wait for process exit before next task');
  api.setActive(null);
  for(const status of ['failed','cancelled','interrupted']){
    api.state.jobs.push({...completed,id:status,status});await api.handle('deleteJob',{jobId:status});
  }
  await assert.rejects(api.handle('deleteJob',{jobId:'missing'}),/任务不存在/);
  const final=load();assert.equal(final.state.jobs.length,0);
  console.log('PASS: delete all task states; retain files; persist deletion and duplicate checks across restarts; allow different formats and missing files.');
}finally{if(path.dirname(path.resolve(data))!==path.resolve(testRoot))throw new Error('Unexpected cleanup path');fs.rmSync(data,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
