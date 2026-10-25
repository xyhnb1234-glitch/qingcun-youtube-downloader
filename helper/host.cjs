'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn, execFile} = require('node:child_process');
const readline = require('node:readline');
const crypto = require('node:crypto');
const ROOT = __dirname;
const DATA = process.env.QINGCUN_DATA || path.join(process.env.LOCALAPPDATA || os.homedir(), 'QingCun', 'data');
fs.mkdirSync(DATA,{recursive:true});
const stateFile = path.join(DATA,'state.json');
let saved = {};
try { saved = JSON.parse(fs.readFileSync(stateFile,'utf8')); } catch {}
const state = {
  completedDownloads: saved.completedDownloads || [],
  settings: {folder:path.join(os.homedir(),'Downloads','轻存'),cookies:'',...saved.settings},
  jobs: (saved.jobs || []).slice(-100).map(job => ['queued','downloading','processing'].includes(job.status) ? {...job,status:'interrupted',error:'助手已关闭，请点击重试。'} : job)
};
let active, exiting=false, bytes=Buffer.alloc(0), lastEmit=0;
const processes=new Set(), analyses=new Map();
function rememberCompleted(job) {
  if(job.status!=='completed' || !job.file)return;
  const key=downloadKey(job);
  state.completedDownloads=state.completedDownloads.filter(item=>downloadKey(item)!==key);
  state.completedDownloads.push({url:job.url,kind:job.kind,formatId:job.formatId,file:job.file});
}
function downloadKey(job) { return JSON.stringify([job.url,job.kind,job.kind==='audio'?'':job.formatId]); }
function rejectDuplicate(candidate, excludeId) {
  const key=downloadKey(candidate);
  if(state.jobs.some(job=>job.id!==excludeId && downloadKey(job)===key && ['queued','downloading','processing'].includes(job.status)))
    throw new Error('相同视频和画质已在下载队列中，请勿重复添加。');
  if([...state.jobs,...state.completedDownloads].some(job=>downloadKey(job)===key && job.file && fs.existsSync(job.file) && (!job.status || job.status==='completed')))
    throw new Error('相同视频和画质已下载，文件仍在本机，无需重复下载。删除任务记录后也会保留此检查。');
}
state.jobs.forEach(rememberCompleted);
const lockFile=path.join(DATA,'host.lock');
let lockOwned=false;
function send(message) {
  if(exiting)return;
  const body=Buffer.from(JSON.stringify(message));
  if(body.length>900000)throw new Error('响应内容过大');
  const head=Buffer.alloc(4);head.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([head,body]));
}
function persist() {
  const temporary=stateFile+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(state,null,2));
  fs.renameSync(temporary,stateFile);
}
function publish(force=true) {
  if(!force && Date.now()-lastEmit<350)return;
  lastEmit=Date.now();persist();send({event:'state',data:state});
}
function binary(name) {
  const target=path.join(ROOT,'runtime',name+'.exe');
  if(!fs.existsSync(target))throw new Error(`缺少 ${name}，请重新运行“安装助手.cmd”安装下载组件。`);
  return target;
}
function normalizeUrl(input) {
  let url;try{url=new URL(input);}catch{throw new Error('请输入有效的 YouTube 视频链接');}
  if(url.protocol!=='https:' || url.username || url.password || url.port)throw new Error('请使用 https:// 开头的 YouTube 链接');
  const hosts=['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be'];
  if(!hosts.includes(url.hostname.toLowerCase()))throw new Error('仅支持 YouTube 视频链接');
  let id;
  if(url.hostname.endsWith('youtu.be'))id=url.pathname.split('/')[1];
  else if(url.pathname==='/watch')id=url.searchParams.get('v');
  else if(/^\/(shorts|live|embed)\//.test(url.pathname))id=url.pathname.split('/')[2];
  if(!/^[A-Za-z0-9_-]{11}$/.test(id || ''))throw new Error('链接中没有有效的视频 ID，请粘贴单个视频链接');
  return `https://www.youtube.com/watch?v=${id}`;
}
function baseArgs(settings) {
  const args=['--ignore-config','--no-playlist','--no-cache-dir','--no-colors','--encoding','utf-8','--socket-timeout','25','--retries','3','--fragment-retries','3','--js-runtimes',`node:${binary('node')}`,'--ffmpeg-location',path.join(ROOT,'runtime')];
  binary('ffmpeg');binary('ffprobe');
  if(settings.cookies) {
    if(!fs.existsSync(settings.cookies))throw new Error('选择的 Cookie 文件已不存在，请重新选择或清除。');
    args.push('--cookies',settings.cookies);
  }
  return args;
}
function child(args) {
  const proc=spawn(binary('yt-dlp'),args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  processes.add(proc);proc.once('close',()=>processes.delete(proc));
  return proc;
}
function stop(proc) {
  if(!proc || proc.exitCode!==null)return;
  if(process.platform==='win32') {
    execFile('taskkill.exe',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true},()=>{});
  }else proc.kill('SIGTERM');
}
function friendly(raw) {
  const text=String(raw || '').replace(/\u001b\[[0-9;]*m/g,'').trim();
  const tail=text.slice(-2800);
  if(/sign in|confirm you.re not a bot|login required/i.test(tail))return 'YouTube 要求登录验证。请在本地设置中选择你导出的 Cookie 文件，然后重试。\n'+tail;
  if(/requested format.*not available/i.test(tail))return '该画质已不可用，请重新读取视频并选择画质。\n'+tail;
  if(/timed? ?out|unable to download|network is unreachable|resolve|connection/i.test(tail))return '网络连接失败，请检查本机能否访问 YouTube，再点击重试。\n'+tail;
  return tail || '任务失败，未收到下载组件的错误信息。';
}
function metadata(url,settings) {
  return new Promise((resolve,reject)=>{
    const proc=child([...baseArgs(settings),'--dump-single-json','--skip-download','--',url]);
    const chunks=[];let size=0,error='',settled=false;
    const timer=setTimeout(()=>{stop(proc);finish(new Error('读取视频超时，请检查网络或登录信息。'));},120000);
    const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(value);};
    proc.stdout.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024){stop(proc);finish(new Error('视频信息过大'));}else chunks.push(chunk);});
    proc.stderr.on('data',chunk=>{error=(error+chunk.toString()).slice(-6000);});
    proc.on('error',err=>finish(err));
    proc.on('close',code=>{
      if(code!==0)return finish(new Error(friendly(error)));
      try{const info=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(info.is_live)throw new Error('正在直播的视频暂不支持，请在直播结束后下载回放。');finish(null,info);}catch(err){finish(err);}
    });
  });
}
function videoFormats(info) {
  return (info.formats || []).filter(f=>f.vcodec && f.vcodec!=='none' && Number(f.height)>0 && !f.has_drm && /^[A-Za-z0-9_.-]{1,80}$/.test(String(f.format_id))).map(f=>({
    id:String(f.format_id),height:f.height,fps:f.fps || 0,tbr:f.tbr || 0,hasAudio:!!f.acodec && f.acodec!=='none',
    label:`${f.height}p${f.fps>30?' · '+f.fps+'fps':''} · ${f.ext} · ${(f.vcodec || '').split('.')[0]}${f.dynamic_range && f.dynamic_range!=='SDR'?' · '+f.dynamic_range:''}${f.filesize?' · '+Math.round(f.filesize/1048576)+' MB（视频流）':''}`
  })).sort((a,b)=>b.height-a.height || b.fps-a.fps || b.tbr-a.tbr);
}
function runQueue() {
  if(active || exiting)return;
  const job=state.jobs.find(item=>item.status==='queued');if(!job)return;
  active={job,proc:null};job.status='downloading';job.percent=null;job.error='';job.speed=null;job.eta=null;
  publish();
  try {
    fs.mkdirSync(job.folder,{recursive:true});
    const template=path.join(job.folder,`%(title).150B [%(id)s] [${job.id.slice(0,8)}].%(ext)s`);
    const args=[...baseArgs(job.settings),'--newline','--progress','--progress-delta','0.5','--windows-filenames','--no-overwrites','--output',template,
      '--progress-template','download:QC_PROGRESS:%(progress)j',
      '--progress-template','postprocess:QC_PROCESS:%(progress)j',
      '--print','after_move:QC_FILE:%(filepath)j','--no-simulate'];
    if(job.kind==='audio')args.push('-f','bestaudio/best','--extract-audio','--audio-format','mp3','--audio-quality','0');
    else args.push('-f',job.hasAudio ? job.formatId : `${job.formatId}+bestaudio/${job.formatId}`,'--merge-output-format','mkv','--remux-video','mkv');
    args.push('--',job.url);
    const proc=child(args);active.proc=proc;let stderr='',eventError='';
    proc.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-6000);});
    const lines=readline.createInterface({input:proc.stdout,crlfDelay:Infinity});
    lines.on('line',line=>{
      if(job.status==='cancelled')return;
      try{
        if(line.startsWith('QC_PROGRESS:')) {
          const p=JSON.parse(line.slice(12));job.speed=Number.isFinite(p.speed)?p.speed:null;job.eta=Number.isFinite(p.eta)?p.eta:null;
          const total=p.total_bytes || p.total_bytes_estimate;
          job.percent=total?Math.min(100,100*p.downloaded_bytes/total):null;
          job.status=p.status==='finished'?'processing':'downloading';publish(false);
        }else if(line.startsWith('QC_PROCESS:')){job.status='processing';job.speed=null;job.eta=null;publish(false);}
        else if(line.startsWith('QC_FILE:')){job.file=JSON.parse(line.slice(8));}
      }catch{}
    });
    proc.on('error',err=>{eventError=err.message;});
    proc.once('close',code=>{
      if(job.status!=='cancelled'){
        if(code===0 && job.file && fs.existsSync(job.file)){job.status='completed';job.percent=100;rememberCompleted(job);}
        else{job.status='failed';job.error=friendly(eventError || stderr || '没有找到输出文件');}
      }
      job.speed=null;job.eta=null;active=null;publish();runQueue();
    });
  }catch(error){job.status='failed';job.error=error.message;active=null;publish();runQueue();}
}
function powershell(script) {
  return new Promise((resolve,reject)=>{
    execFile('powershell.exe',['-NoProfile','-STA','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,maxBuffer:1024*1024,timeout:180000},(error,stdout)=>error?reject(new Error('系统对话框未能完成，请重试。')):resolve(stdout.trim()));
  });
}
async function handle(command,data) {
  switch(command) {
    case 'hello':binary('yt-dlp');binary('ffmpeg');binary('ffprobe');binary('node');return state;
    case 'analyze':{
      const url=normalizeUrl(data.url),info=await metadata(url,state.settings);
      const result={url,title:String(info.title || info.id).slice(0,500),duration:info.duration,formats:videoFormats(info)};
      analyses.set(url,{result,at:Date.now()});if(analyses.size>30)analyses.delete(analyses.keys().next().value);
      return result;
    }
    case 'download':{
      const url=normalizeUrl(data.url),entry=analyses.get(url);
      if(!entry || Date.now()-entry.at>3600000)throw new Error('请重新读取视频后再下载。');
      if(!['video','audio'].includes(data.kind))throw new Error('下载类型无效');
      const format=entry.result.formats.find(item=>item.id===data.formatId);
      if(data.kind==='video' && !format)throw new Error('请选择实际可用的画质');
      rejectDuplicate({url,kind:data.kind,formatId:format?.id || ''});
      if(state.jobs.filter(j=>['queued','downloading','processing'].includes(j.status)).length>=20)throw new Error('队列最多容纳 20 个任务');
      while(state.jobs.length>=100){const index=state.jobs.findIndex(j=>!['queued','downloading','processing'].includes(j.status));if(index<0)break;state.jobs.splice(index,1);}
      const job={id:crypto.randomUUID(),url,title:entry.result.title,kind:data.kind,formatId:format?.id || '',hasAudio:format?.hasAudio || false,label:format?.label || 'MP3 音频',folder:state.settings.folder,settings:{...state.settings},status:'queued',createdAt:new Date().toISOString()};
      state.jobs.push(job);publish();runQueue();return {jobId:job.id};
    }
    case 'cancel':{
      const job=state.jobs.find(item=>item.id===data.jobId);if(!job)throw new Error('任务不存在');
      if(['queued','downloading','processing'].includes(job.status)){job.status='cancelled';job.speed=null;job.eta=null;if(active?.job===job)stop(active.proc);publish();}
      return state;
    }
    case 'retry':{
      const job=state.jobs.find(item=>item.id===data.jobId);
      if(!job || !['failed','cancelled','interrupted'].includes(job.status))throw new Error('该任务无法重试');
      if(active?.job===job)throw new Error('正在停止上一次下载，请稍后再试。');
      rejectDuplicate(job,job.id);
      job.status='queued';job.error='';job.percent=null;job.file=null;job.settings={...state.settings};publish();runQueue();return state;
    }
    case 'deleteJob':{
      const index=state.jobs.findIndex(item=>item.id===data.jobId);
      if(index<0)throw new Error('任务不存在，可能已被删除。');
      const job=state.jobs[index];rememberCompleted(job);
      if(active?.job===job){job.status='cancelled';job.speed=null;job.eta=null;stop(active.proc);}
      state.jobs.splice(index,1);publish();runQueue();return state;
    }
    case 'reveal':{
      const job=state.jobs.find(item=>item.id===data.jobId);
      if(!job || job.status!=='completed' || !job.file || !fs.existsSync(job.file))throw new Error('下载文件已移动或不存在');
      const relative=path.relative(job.folder,job.file);
      if(relative.startsWith('..') || path.isAbsolute(relative))throw new Error('文件路径不属于下载文件夹');
      const proc=spawn('explorer.exe',['/select,',job.file],{windowsHide:true,detached:true,stdio:'ignore'});proc.on('error',()=>{});proc.unref();return {ok:true};
    }
    case 'chooseFolder':{
      const result=await powershell("[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = '选择下载文件夹'; if ($dialog.ShowDialog() -eq 'OK') { [Console]::Write($dialog.SelectedPath) }");
      if(result){if(!path.isAbsolute(result))throw new Error('请选择绝对路径');state.settings.folder=result;publish();}return state;
    }
    case 'chooseCookies':{
      const result=await powershell("[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Filter = 'Cookie files (*.txt)|*.txt'; if ($dialog.ShowDialog() -eq 'OK') { [Console]::Write($dialog.FileName) }");
      if(result){const content=fs.readFileSync(result,'utf8');if(!/^# (Netscape )?HTTP Cookie File/.test(content))throw new Error('需要 Netscape 格式的 Cookie 文件');state.settings.cookies=result;publish();}return state;
    }
    case 'clearCookies':state.settings.cookies='';publish();return state;
    default:throw new Error('不支持的操作');
  }
}
function shutdown() {
  if(exiting)return;exiting=true;for(const proc of processes)stop(proc);
  for(const job of state.jobs)if(['queued','downloading','processing'].includes(job.status))job.status='interrupted';
  try{if(lockOwned){persist();fs.unlinkSync(lockFile);}}catch{}setTimeout(()=>process.exit(0),300).unref();
}
function acquireLock() { try {
  try {
    const oldPid=Number(fs.readFileSync(lockFile,'utf8'));let alive=false;
    if(Number.isInteger(oldPid) && oldPid>0){try{process.kill(oldPid,0);alive=true;}catch{}}
    if(!alive)fs.unlinkSync(lockFile);
  }catch{}
  fs.writeFileSync(lockFile,String(process.pid),{flag:'wx'});lockOwned=true;
  try {
    const current=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    state.settings={...state.settings,...current.settings};
    state.completedDownloads=current.completedDownloads || [];
    state.jobs=(current.jobs || []).slice(-100).map(job=>['queued','downloading','processing'].includes(job.status)?{...job,status:'interrupted',error:'助手已关闭，请点击重试。'}:job);
    state.jobs.forEach(rememberCompleted);
  }catch{}
}catch{} }
acquireLock();
process.stdin.on('data',chunk=>{
  bytes=Buffer.concat([bytes,chunk]);
  while(bytes.length>=4){
    const length=bytes.readUInt32LE(0);if(length>1048576){shutdown();return;}
    if(bytes.length<4+length)break;
    const body=bytes.subarray(4,4+length);bytes=bytes.subarray(4+length);
    let message;try{message=JSON.parse(body.toString('utf8'));}catch{continue;}
    Promise.resolve().then(()=>{if(!lockOwned)acquireLock();if(!lockOwned)throw new Error('另一个浏览器正在使用下载助手。请关闭另一个浏览器，再点击检查连接；同一浏览器可使用多个面板。');return handle(message.command,message.data || {});}).then(data=>send({id:message.id,data}),error=>send({id:message.id,error:error.message}));
  }
});
process.stdin.on('end',shutdown);process.stdin.on('error',shutdown);process.stdout.on('error',shutdown);
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
if(require.main!==module)module.exports={normalizeUrl,videoFormats,friendly};
