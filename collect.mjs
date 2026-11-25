// Collect UI strings across Settings sections and top menus, one CDP session.
// usage: node collect.mjs <port> <out.json>
import { writeFile } from 'node:fs/promises';

const PORT = Number(process.argv[2] || 9334);
const OUT = process.argv[3] || 'collected.json';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const main = list.find(t => t.type === 'page' && t.title === 'Antigravity')
  || list.filter(t => t.type === 'page' && /workbench|127\.0\.0\.1:/.test(t.url)).pop();
if (!main) { console.error('no Antigravity page'); process.exit(1); }

const ws = new WebSocket(main.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = ev => { const d = JSON.parse(ev.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const call = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.result?.exceptionDetails) return null;
  return r?.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DUMP = `(() => {
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT']);
  const out = [];
  const seen = new Set();
  const walk = (n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t.length >= 2 && /[A-Za-z]/.test(t) && t.length <= 160 && !seen.has(t)) {
        const el = n.parentElement;
        if (el && !el.closest('.monaco-editor, textarea, [contenteditable="true"], pre, code')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) { seen.add(t); out.push({ tag: el.tagName, role: el.getAttribute('role') || '', text: t }); }
        }
      }
    } else if (n.nodeType === 1 && !skip.has(n.tagName)) { for (const c of n.childNodes) walk(c); }
  };
  walk(document.body);
  return JSON.stringify(out);
})()`;

const CLICK = (text) => `(() => {
  const want = ${JSON.stringify(text)};
  let cands = [...document.querySelectorAll('*')].filter(e => (e.textContent||'').trim() === want);
  if (!cands.length) return 'not-found';
  cands.sort((a,b) => a.children.length - b.children.length);
  const t = cands[0];
  t.scrollIntoView({block:'center'});
  t.click();
  return 'ok:' + t.tagName;
})()`;

async function dump() {
  const raw = await evaluate(DUMP);
  return typeof raw === 'string' ? JSON.parse(raw) : [];
}
async function pressEscape() {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
}

const all = new Map();
const record = (scope, rows) => {
  for (const r of rows) {
    if (!all.has(r.text)) all.set(r.text, { ...r, scope: [scope] });
    else { const e = all.get(r.text); if (!e.scope.includes(scope)) e.scope.push(scope); }
  }
};

// 1) 设置页各分区
const sections = ['General', 'Application', 'Appearance', 'Shortcuts', 'Notifications', 'Models', 'Browser'];
for (const s of sections) {
  const r = await evaluate(CLICK(s));
  await sleep(900);
  const rows = await dump();
  console.error(`${s}: ${r} (${rows.length})`);
  record('settings/' + s, rows);
}

// 2) 顶部菜单
for (const m of ['Workspace', 'View', 'Window']) {
  const r = await evaluate(CLICK(m));
  await sleep(500);
  const rows = await dump();
  console.error(`menu ${m}: ${r} (${rows.length})`);
  record('menu/' + m, rows);
  await pressEscape();
  await sleep(300);
}

await writeFile(OUT, JSON.stringify([...all.values()], null, 1));
console.error(`total unique: ${all.size} -> ${OUT}`);
ws.close();
process.exit(0);