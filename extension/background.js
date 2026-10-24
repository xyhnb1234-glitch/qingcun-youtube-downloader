let port;
const waiting = new Map();
function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative('com.qingcun.youtube');
  port.onMessage.addListener(message => {
    if (message.event === 'state') chrome.storage.local.set({state: message.data});
    const pending = waiting.get(message.id);
    if (pending) {
      clearTimeout(pending.timer); waiting.delete(message.id);
      pending.resolve(message);
    }
  });
  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || '本地助手已断开';
    port = null;
    for (const pending of waiting.values()) {
      clearTimeout(pending.timer); pending.resolve({error});
    }
    waiting.clear();
    chrome.storage.local.set({connectionError: error});
  });
  chrome.storage.local.set({connectionError: ''});
  return port;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message.type !== 'native') return;
  const id = crypto.randomUUID();
  const timer = setTimeout(() => {
    waiting.delete(id); reply({error: '请求超时，请检查本地助手或网络后重试。'});
  }, 150000);
  waiting.set(id, {resolve: reply, timer});
  try { connect().postMessage({id, command: message.command, data: message.data || {}}); }
  catch (error) { clearTimeout(timer); waiting.delete(id); reply({error: error.message}); }
  return true;
});
chrome.action.onClicked.addListener(async tab => {
  await chrome.storage.local.set({currentVideo: tab.url || ''});
  const url = chrome.runtime.getURL('manager.html');
  const existing = (await chrome.tabs.query({})).find(item => item.url === url);
  if (existing) { await chrome.tabs.update(existing.id, {active: true}); await chrome.windows.update(existing.windowId, {focused: true}); }
  else await chrome.tabs.create({url});
});
