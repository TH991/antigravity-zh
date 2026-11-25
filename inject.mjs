// Antigravity 中文注入器（CDP 驱动）
// 用法: node inject.mjs [port] [--watch] [--shot out.png]
//   port    默认 9223（启动器加的 --remote-debugging-port）
//   --watch 常驻：页面刷新/导航后自动补装，直到 CDP 掉线
//   --shot  注入后截一张图
// 原理: 连上主渲染进程，注册「新文档即注入」的脚本 + 当场注入一次 MutationObserver 翻译层。
//       不改任何文件，关掉应用即恢复原样。
import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const PORT = Number(args.find(a => /^\d+$/.test(a)) || 9223);
const WATCH = args.includes('--watch');
const shotIdx = args.indexOf('--shot');
const shotOut = shotIdx >= 0 ? args[shotIdx + 1] : null;

const dict = JSON.parse(await readFile(new URL('./dict.json', import.meta.url), 'utf8'));

// 页面内的翻译层。同一份脚本既用于「新文档注入」，也用于「当场注入」。
const pageScript = `(() => {
  const DICT = ${JSON.stringify(dict)};
  const SKIP = 'code,pre,.monaco-editor,textarea,[contenteditable="true"],.markdown-body,.chat-message,.composer';

  function tr(node) {
    const el = node.parentElement;
    if (!el || el.closest(SKIP)) return;
    const raw = node.nodeValue;
    const key = raw.trim();
    if (key.length < 2 || key.length > 400) return;
    let zh = DICT[key];
    if (!zh) {
      const m = key.match(/^You have used some of your (5-hour|weekly) limit, it will fully refresh in (.+)\\.$/);
      if (m) {
        const span = m[2].replace(/([0-9]+) hours?/, '$1 小时').replace(/([0-9]+) minutes?/, '$1 分钟');
        zh = '你已用掉部分' + (m[1] === 'weekly' ? '每周' : '5 小时') + '额度，将在 ' + span + ' 后完全恢复。';
      }
    }
    if (!zh) {
      const g = key.match(/^Good to see you, (.+?)\\. What.s next\\?$/);
      if (g) zh = '很高兴见到你，' + g[1] + '。接下来做什么？';
    }
    if (!zh) {
      const w = key.match(/^Welcome back, (.+?)\\.\\s*Where should we pick up\\?$/);
      if (w) zh = '欢迎回来，' + w[1] + '。想从哪儿继续？';
    }
    if (!zh) {
      const h = key.match(/^(?:Hey|Hi|Hello) (.+?), what do you want to build today\\?$/);
      if (h) zh = '嘿 ' + h[1] + '，今天想构建点什么？';
    }
    if (!zh) {
      const h2 = key.match(/^(?:Hey|Hi|Hello) (.+?), what should we build today\\?$/);
      if (h2) zh = '嘿 ' + h2[1] + '，今天想做点什么？';
    }
    if (!zh) {
      const u = key.match(/^Updated (\\d{1,2}:\\d{2})$/);
      if (u) zh = '更新于 ' + u[1];
    }
    if (!zh) {
      const lv = key.match(/^((?:Gemini|Claude|GPT)[^,]*?)\\s+(High|Medium|Low)$/);
      if (lv) zh = lv[1] + ' ' + ({ High: '高', Medium: '中', Low: '低' })[lv[2]];
    }
    // 自动化页空态被拆成三个 <p>：No / automations / yet，必须按上下文分别处理
    if (!zh && el.className && /text-lg/.test(String(el.className))) {
      if (key === 'No') zh = '暂无';
      else if (key === 'yet') zh = '';
    }
    // 模型列表里的 New 是角标（同一行有模型名），页面上的 New 是按钮
    if (!zh && key === 'New') {
      const row = el.closest('[role="menuitem"]') || el.parentElement;
      const rowText = row ? String(row.textContent || '') : '';
      zh = /(Gemini|Claude|GPT)/.test(rowText) ? '新' : '新建';
    }
    if (zh === undefined || zh === key) return;
    node.nodeValue = raw.replace(key, zh);
  }

  function walk(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) tr(n);
  }

  function install() {
    if (!document.body) return false;
    if (window.__AG_ZH__) { try { window.__AG_ZH__.mo && window.__AG_ZH__.mo.disconnect(); } catch (e) {} }
    const mo = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'childList') {
          for (const x of m.addedNodes) {
            if (x.nodeType === 1) walk(x);
            else if (x.nodeType === 3) tr(x);
          }
        } else if (m.type === 'characterData') tr(m.target);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__AG_ZH__ = { dict: DICT, walk, mo };
    walk(document.body);
    return true;
  }

  // 新文档注入时 body 往往还不存在：等 DOMContentLoaded，必要时再轮询兜底。
  if (!install()) {
    document.addEventListener('DOMContentLoaded', () => { install(); }, { once: true });
    let tries = 0;
    const timer = setInterval(() => {
      if (install() || ++tries > 150) clearInterval(timer);
    }, 100);
  }
  return 'installed';
})()`;

// 轻量探针：只看翻译层还在不在，不重扫 DOM。
const probeScript = `(() => !!(window.__AG_ZH__ && window.__AG_ZH__.mo))()`;

async function cdpAlive() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return r.ok;
  } catch { return false; }
}

async function pickTarget() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  return list.filter(t => t.type === 'page' && /workbench|Antigravity|127\.0\.0\.1:/.test(t.url + t.title)).pop()
    || list.filter(t => t.type === 'page').pop()
    || null;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let seq = 0;
    const pending = new Map();
    ws.onmessage = ev => {
      const d = JSON.parse(ev.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    };
    ws.onerror = err => reject(err);
    ws.onopen = () => resolve({
      ws,
      call: (method, params = {}) => new Promise(res => {
        const id = ++seq;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      })
    });
  });
}

let session = null;

// 启动瞬间 CDP 已经起来、但主页面还没创建：等一会儿，别急着报错退出。
async function waitForTarget(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { const t = await pickTarget(); if (t) return t; } catch {}
    if (Date.now() >= deadline) return null;
    await new Promise(r => setTimeout(r, 500));
  }
}

async function ensureConnected() {
  if (session && session.ws.readyState === 1) return session;
  const target = (await pickTarget()) || (await waitForTarget(20000));
  if (!target) throw new Error('CDP 上没有页面目标：确认 Antigravity 是用启动器打开、且带 --remote-debugging-port');
  session = await connect(target.webSocketDebuggerUrl);
  session.targetId = target.id;
  // 关键：让翻译层跟着「每一个新文档」走，刷新/换页后自动生效。
  await session.call('Page.enable');
  await session.call('Page.addScriptToEvaluateOnNewDocument', { source: pageScript });
  return session;
}

// 窗口重开 / 换了主页面目标时，旧会话装到的是已消失的 target，得整个重连。
async function targetChanged() {
  if (!session) return true;
  try {
    const t = await pickTarget();
    return !t || t.id !== session.targetId;
  } catch { return false; }
}

async function installNow() {
  const s = await ensureConnected();
  const r = await s.call('Runtime.evaluate', { expression: pageScript, returnByValue: true });
  return r?.result?.result?.value;
}

async function isInstalled() {
  const s = await ensureConnected();
  const r = await s.call('Runtime.evaluate', { expression: probeScript, returnByValue: true });
  return r?.result?.result?.value === true;
}

// ---- 首次注入 ----
let state;
try {
  state = await installNow();
} catch (e) {
  console.error(`注入失败: ${e.message}`);
  process.exit(1);
}
console.error(`target: ${session.targetId}`);
console.log(`注入结果: ${state}`);
if (state !== 'installed') { try { session.ws.close(); } catch {} process.exit(1); }

if (shotOut) {
  await new Promise(r => setTimeout(r, 600));
  const shot = await session.call('Page.captureScreenshot', { format: 'png' });
  const b64 = shot?.result?.data;
  if (b64) { await writeFile(shotOut, Buffer.from(b64, 'base64')); console.error(`截图: ${shotOut}`); }
}
console.log(`词条 ${Object.keys(dict).length} 条已生效`);

if (!WATCH) {
  try { session.ws.close(); } catch {}
  process.exit(0);
}

// ---- 常驻模式：补装 + 掉线重连 ----
console.log('watch: 已进入常驻模式（页面刷新/导航后自动补装）');
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  try { session?.ws.close(); } catch {}
  console.log('watch: 退出');
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

for (;;) {
  await new Promise(r => setTimeout(r, 3000));
  if (!(await cdpAlive())) { console.log('watch: CDP 已消失（Antigravity 关闭），退出'); stop(0); }
  try {
    if (await targetChanged()) {
      const target = await pickTarget();
      console.log(`watch: 主页面目标变了（${target ? target.id.slice(0, 8) : '暂无'}），重连并重新装载`);
      try { session?.ws.close(); } catch {}
      session = null;
      const s = await installNow();
      console.log(`watch: 已在新页面装载（${s}）`);
      continue;
    }
    if (!(await isInstalled())) {
      const s = await installNow();
      console.log(`watch: 检测到翻译层丢失，已补装（${s}）`);
    }
  } catch (e) {
    // 页面重载瞬间 target 可能短暂不可用，断开重连下一轮再说
    console.log(`watch: 连接异常，稍后重连（${e.message}）`);
    try { session?.ws.close(); } catch {}
    session = null;
  }
}