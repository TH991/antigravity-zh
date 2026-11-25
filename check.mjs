// 覆盖率检查：逐个点设置分区，dump 可见文本，报出仍含英文字母且不在词典里的条目。
// usage: node check.mjs <port>
import { readFile } from 'node:fs/promises';

const PORT = Number(process.argv[2] || 9334);
const dict = JSON.parse(await readFile(new URL('./dict.json', import.meta.url), 'utf8'));
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.filter(t => t.type === 'page' && t.title === 'Antigravity').pop();
if (!page) { console.error('no Antigravity page'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = ev => { const d = JSON.parse(ev.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const call = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r?.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CLICK = t => `(() => {
  const want = ${JSON.stringify(t)};
  const all = [...document.querySelectorAll('*')].filter(e => (e.textContent||'').trim() === want && e.children.length === 0);
  const el = all[0];
  if (!el) return 'not-found';
  el.scrollIntoView({block:'nearest'}); el.click(); return 'clicked:' + el.tagName;
})()`;

const DUMP = `(() => {
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT']);
  const out = [];
  const walk = n => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t.length >= 2 && /[A-Za-z]/.test(t)) {
        const el = n.parentElement; if (!el) return;
        if (el.closest('.monaco-editor, textarea, [contenteditable="true"], pre, code')) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push(t);
      }
    } else if (n.nodeType === 1 && !skip.has(n.tagName)) { for (const c of n.childNodes) walk(c); }
  };
  walk(document.body);
  return JSON.stringify(out);
})()`;

console.log('open settings ->', await ev(CLICK('设置')));
await sleep(900);

const sections = ['通用', '应用', '外观', '快捷键', '通知', '模型', '浏览器'];
const uncovered = {};
for (const s of sections) {
  console.log(`\n## ${s} ->`, await ev(CLICK(s)));
  await sleep(900);
  const raw = await ev(DUMP);
  const arr = JSON.parse(raw || '[]');
  const leftover = [...new Set(arr.filter(t => !dict[t] && !/^[\d\s:.,%+/-]+$/.test(t) && /[A-Za-z]{2,}/.test(t)))];
  const done = [...new Set(arr.filter(t => dict[t]))];
  console.log(`   可见(含英文) ${arr.length} 条；已翻译 ${done.length} 条；未覆盖 ${leftover.length} 条`);
  for (const t of leftover) { uncovered[t] = s; }
}
await (await import('node:fs/promises')).writeFile('uncovered.json', JSON.stringify(uncovered, null, 2));
console.log(`\n未覆盖合集: ${Object.keys(uncovered).length} 条 -> uncovered.json`);
ws.close();
process.exit(0);