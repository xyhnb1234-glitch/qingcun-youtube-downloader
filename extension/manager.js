const $ = id => document.getElementById(id);
let video, latestState;
const statuses = {queued:'等待下载',downloading:'正在下载',processing:'正在合并 / 转换',completed:'已完成',failed:'下载失败',cancelled:'已取消',interrupted:'助手关闭，任务已中断'};
function notice(message = '') { $('notice').textContent = message; }
async function call(command, data = {}) {
  const response = await chrome.runtime.sendMessage({type:'native',command,data});
  if (!response || response.error) throw new Error(response?.error || '本地助手没有响应');
  return response.data;
}
async function run(button, action) {
  button.disabled = true; notice();
  try { await action(); } catch (error) { notice(error.message); }
  finally { button.disabled = false; }
}
function render(state) {
  if (!state) return;
  latestState = state;
  $('folder').textContent = state.settings.folder;
  $('cookies').textContent = state.settings.cookies ? `已选择本地文件：${state.settings.cookies}` : '未使用登录信息';
  $('jobs').replaceChildren();
  if (!state.jobs.length) { const empty = document.createElement('p'); empty.className='hint';empty.textContent='还没有下载任务';$('jobs').append(empty); }
  for (const job of [...state.jobs].reverse()) {
    const item = document.createElement('article'); item.className = 'job';
    const title = document.createElement('h3');title.textContent = job.title;
    const label = document.createElement('div');label.className = 'status' + (job.status === 'failed' ? ' error' : '');
    const pct = Number.isFinite(job.percent) ? ` · ${job.percent.toFixed(1)}%（当前媒体流）` : '';
    label.textContent = (statuses[job.status] || job.status) + (job.status === 'downloading' ? pct : '') + (job.speed ? ` · ${(job.speed/1048576).toFixed(2)} MB/s` : '') + (job.eta ? ` · 剩余 ${Math.ceil(job.eta)} 秒` : '') + (job.error ? `\n${job.error}` : '');
    const progress = document.createElement('progress');progress.max=100;
    if (job.status === 'completed') progress.value=100;
    else if (job.status === 'downloading' && Number.isFinite(job.percent)) progress.value=job.percent;
    else if (!['processing','downloading'].includes(job.status)) progress.value=0;
    const actions = document.createElement('div');actions.className='row';
    const meta = document.createElement('span');meta.className='hint';meta.textContent=job.kind==='audio'?'MP3 音频':job.label;actions.append(meta);
    const controls = document.createElement('div');controls.className='row';
    const action = (text, command) => { const b=document.createElement('button');b.className='secondary';b.textContent=text;b.onclick=()=>run(b,()=>call(command,{jobId:job.id}));controls.append(b); };
    if (['queued','downloading','processing'].includes(job.status)) action('取消','cancel');
    if (['failed','cancelled','interrupted'].includes(job.status)) action('重试','retry');
    if (job.status==='completed') action('打开文件夹','reveal');
    actions.append(controls);item.append(title,label,progress,actions);$('jobs').append(item);
  }
}
async function analyze() {
  video = null;$('preview').hidden=true;
  const requestedUrl=$('url').value.trim();
  const result = await call('analyze',{url:requestedUrl});
  if($('url').value.trim()!==requestedUrl)throw new Error('链接已更改，请重新读取视频。');
  video=result;
  $('title').textContent=result.title;
  $('duration').textContent=result.duration ? `时长 ${Math.floor(result.duration/60)} 分 ${Math.floor(result.duration%60)} 秒` : '时长未知';
  $('format').replaceChildren();
  for (const format of result.formats) { const option=document.createElement('option');option.value=format.id;option.textContent=format.label;$('format').append(option); }
  $('kind').value=result.formats.length?'video':'audio';$('kind').dispatchEvent(new Event('change'));
  $('preview').hidden=false;
}
$('analyze').onclick=()=>run($('analyze'),analyze);
$('url').oninput=()=>{video=null;$('preview').hidden=true;};
$('url').onkeydown=event=>{if(event.key==='Enter')$('analyze').click();};
$('kind').onchange=()=>{$('format').disabled=$('kind').value==='audio';};
$('download').onclick=()=>run($('download'),async()=>{
  if(!video)throw new Error('请先读取视频');
  const selected=video.formats.find(f=>f.id===$('format').value);
  await call('download',{url:video.url,kind:$('kind').value,formatId:selected?.id,label:selected?.label});
});
$('reconnect').onclick=()=>run($('reconnect'),async()=>{render(await call('hello'));notice('本地助手已连接');});
for(const command of ['chooseFolder','chooseCookies','clearCookies']) $(command).onclick=()=>run($(command),async()=>{render(await call(command));});
$('extensionId').textContent=chrome.runtime.id;
chrome.storage.onChanged.addListener(changes=>{
  if(changes.state)render(changes.state.newValue);
  if(changes.currentVideo?.newValue){$('url').value=changes.currentVideo.newValue;video=null;$('preview').hidden=true;}
  if(changes.connectionError?.newValue)notice('本地助手未连接。请按下方“首次连接与安装”完成安装，再点击“检查连接”。\n'+changes.connectionError.newValue);
});
(async()=>{
  const stored=await chrome.storage.local.get(['currentVideo','state']);
  if(stored.currentVideo)$('url').value=stored.currentVideo;
  render(stored.state);
  try{render(await call('hello'));}catch(error){notice('本地助手未连接，请展开“首次连接与安装”。\n'+error.message);}
})();
