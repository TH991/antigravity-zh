// 探测右键菜单是 DOM 还是原生：在若干位置发真实右键，再查 DOM 里有没有菜单节点。
// usage: node probe-menu.mjs <port>
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

const rect = await evaluate(`(() => {
  const el = document.querySelector('textarea, [contenteditable="true"], .composer') || document.body;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), tag: el.tagName };
})()`);
console.log('composer rect:', JSON.stringify(rect));

async function rightClickAt(x, y, label) {
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
  await sleep(700);
  const found = await evaluate(`(() => {
    const sels = ['[role="menu"]', '[role="menuitem"]', '[class*="context-menu"]', '[class*="contextmenu"]', '[class*="ContextMenu"]', '[class*="popover"]', '[data-radix-popper-content-wrapper]'];
    const hits = [];
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) {
        const r = el.getBoundingClientRect();
        if (r.width > 20 && r.height > 10) hits.push({ sel: s, text: (el.textContent || '').trim().slice(0, 120) });
      }
    }
    return hits;
  })()`);
  console.log(`rclick ${label} (${x},${y}) -> DOM menu nodes:`, JSON.stringify(found));
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);
}

if (rect && rect.x) await rightClickAt(rect.x, rect.y, 'composer');
await rightClickAt(120, 282, 'sidebar session');
await rightClickAt(700, 500, 'welcome text');
ws.close();
process.exit(0);