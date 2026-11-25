// 扩词表后的验收：逐个打开模型下拉 / 项目选择器 / 会话菜单 / 欢迎页，报告仍然含英文的文本。
// usage: node verify2.mjs <port>
const PORT = Number(process.argv[2] || 9223);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const main = list.filter(t => t.type === 'page' && /workbench|Antigravity|127\.0\.0\.1:/.test(t.url + t.title)).pop()
  || list.filter(t => t.type === 'page').pop();
if (!main) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(main.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = ev => { const d = JSON.parse(ev.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const call = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.result?.exceptionDetails) return { error: r.result.exceptionDetails.text };
  return r?.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TEXTS = `(() => {
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT']);
  const out = new Set();
  const walk = (n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t.length >= 2 && /[A-Za-z]{3,}/.test(t)) {
        const el = n.parentElement; if (!el) return;
        if (el.closest('.monaco-editor, textarea, [contenteditable="true"], pre, code')) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.add(t);
      }
    } else if (n.nodeType === 1 && !skip.has(n.tagName)) { for (const c of n.childNodes) walk(c); }
  };
  walk(document.body);
  return JSON.stringify([...out]);
})()`;

const KNOWN_KEEP = /^(Antigravity|Gemini|Claude|GPT|Google|Firebase|Notion|Context7|Linear|Dynatrace|Stripe)/;

async function report(label) {
  const raw = await evaluate(TEXTS);
  let arr = [];
  try { arr = JSON.parse(raw); } catch { arr = []; }
  const left = arr.filter(t => !KNOWN_KEEP.test(t));
  console.log(`\n## ${label}：剩 ${left.length} 条含英文`);
  for (const t of left.slice(0, 20)) console.log('   - ' + t.slice(0, 110));
}

const clickLabel = (want) => evaluate(`(() => {
  const els = [...document.querySelectorAll('button, [role="button"], a[href]')];
  const hit = els.find(el => ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).includes(${JSON.stringify(want)}));
  if (!hit) return 'not-found';
  hit.click(); return 'ok';
})()`);

const clickText = (want) => evaluate(`(() => {
  const els = [...document.querySelectorAll('*')].filter(e => e.textContent && e.textContent.trim() === ${JSON.stringify(want)});
  const el = els.find(e => e.children.length === 0) || els.pop();
  if (!el) return 'not-found';
  el.click(); return 'ok';
})()`);

await evaluate('location.reload()');
await sleep(5000);

// reload 可能恢复到上次停留的页面，先回欢迎页
await clickText('新对话');
await sleep(1500);

await report('欢迎页（reload 后）');

// 模型下拉
console.log('\n模型下拉:', await clickLabel('Select model'));
await sleep(900);
await report('模型下拉');
await evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'esc'; })()`);
await sleep(500);

// 项目选择器
console.log('\n项目选择器:', await clickLabel('Select project'));
await sleep(1000);
await report('项目选择器');
await evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'esc'; })()`);
await sleep(500);

// 会话「更多」菜单
console.log('\n会话菜单:', await clickLabel('More options'));
await sleep(900);
await report('会话更多菜单');
await evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'esc'; })()`);
await sleep(400);

// 自动化页
console.log('\n自动化:', await clickText('自动化'));
await sleep(1400);
await report('自动化页');
await clickText('新对话');
await sleep(900);

ws.close();
process.exit(0);