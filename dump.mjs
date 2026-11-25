// Dump visible text nodes from the main Antigravity renderer via CDP.
const PORT = process.argv[2] || '9333';

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

const expr = `(() => {
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE']); // code-ish subtrees
  const out = new Map();
  const walk = (n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t.length >= 2 && /[A-Za-z]/.test(t)) {
        const el = n.parentElement;
        if (!el) return;
        // skip inside monaco editor / code / textarea / contenteditable
        if (el.closest('.monaco-editor, textarea, [contenteditable="true"], pre, code')) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const k = el.tagName + '|' + t;
          if (!out.has(k)) out.set(k, { tag: el.tagName, cls: (el.className || '').toString().slice(0,60), text: t });
        }
      }
    } else if (n.nodeType === 1 && !skip.has(n.tagName)) {
      for (const c of n.childNodes) walk(c);
    }
  };
  walk(document.body);
  return JSON.stringify([...out.values()]);
})()`;

const list = await targets();
const main = list.filter(t => t.type === 'page' && /workbench|Antigravity|127\.0\.0\.1:3044/.test(t.url + t.title)).pop()
  || list.filter(t => t.type === 'page').pop();
if (!main) { console.error('no page target'); process.exit(1); }
console.error('target:', main.title, main.url.slice(0, 80), main.webSocketDebuggerUrl);

const ws = new WebSocket(main.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (id, method, params) => ws.send(JSON.stringify({ id, method, params }));
const result = await new Promise((res) => {
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id === 1) res(d);
  };
  send(1, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
});
ws.close();
const raw = result?.result?.result?.value;
if (!raw) { console.error('empty:', JSON.stringify(result).slice(0, 300)); process.exit(2); }
const rows = JSON.parse(raw);
console.log(JSON.stringify({ count: rows.length, rows }, null, 1));