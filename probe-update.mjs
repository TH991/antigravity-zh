// 更新后体检：版本、翻译层状态、仍未翻译的可见英文
import { readFile } from 'node:fs/promises';

const dict = JSON.parse(await readFile(new URL('./dict.json', import.meta.url), 'utf8'));
const port = process.argv[2] || '9223';

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const t = list.filter((x) => x.type === 'page' && !x.url.startsWith('data:')).pop();
if (!t) { console.log('找不到页面 target'); process.exit(1); }

const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const waiters = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  const w = waiters.get(msg.id);
  if (w) { waiters.delete(msg.id); w(msg); }
});
const send = (method, params = {}) => new Promise((res) => {
  const myId = ++id;
  waiters.set(myId, res);
  ws.send(JSON.stringify({ id: myId, method, params }));
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

const expr = `(() => {
  const out = { ua: navigator.userAgent, installed: !!(window.__AG_ZH__ && window.__AG_ZH__.mo), size: window.__AG_ZH__ ? Object.keys(window.__AG_ZH__.dict).length : 0, missing: [] };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const raw = (n.nodeValue || '').trim();
    if (!raw || raw.length > 200) continue;
    if (!/[A-Za-z]{2}/.test(raw)) continue;
    const el = n.parentElement;
    if (!el || el.closest('code,pre,.monaco-editor,textarea,[contenteditable="true"]')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.missing.push(raw);
  }
  return JSON.stringify(out);
})()`;

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
const data = JSON.parse(r.result.result.value);
const unresolved = data.missing.filter((s) => !dict[s]);
const dynamic = unresolved.filter((s) => /good to see you|used some of your/i.test(s));

console.log('target      :', t.url);
console.log('UA          :', data.ua);
console.log('翻译层      :', data.installed, '| 词典', data.size, '条');
console.log('含英文文本  :', data.missing.length, '条 | 未命中词典', unresolved.length, '条');
if (dynamic.length) console.log('动态文案    :', dynamic.join(' | '));
console.log('--- 未命中（前 25 条） ---');
unresolved.slice(0, 25).forEach((s) => console.log('  ' + s));
ws.close();
process.exit(0);