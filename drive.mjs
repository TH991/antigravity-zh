// Drive the Antigravity renderer over CDP.
// usage: node drive.mjs <port> <action> [action...]
//   dump            print visible text nodes as JSON
//   click:<text>    click the smallest element whose exact trimmed text matches
//   shot:<file>     screenshot page
//   wait:<ms>       sleep
//   eval:<js>       evaluate expression, print result
import { writeFile } from 'node:fs/promises';

const [portArg, ...actions] = process.argv.slice(2);
const PORT = Number(portArg || 9223);

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

const DUMP = `(() => {
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT']);
  const out = new Map();
  const walk = (n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t.length >= 2 && /[A-Za-z]/.test(t)) {
        const el = n.parentElement; if (!el) return;
        if (el.closest('.monaco-editor, textarea, [contenteditable="true"], pre, code')) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const k = t;
          if (!out.has(k)) out.set(k, { tag: el.tagName, role: el.getAttribute('role') || '', cls: (el.className||'').toString().slice(0,50), text: t });
        }
      }
    } else if (n.nodeType === 1 && !skip.has(n.tagName)) { for (const c of n.childNodes) walk(c); }
  };
  walk(document.body);
  return JSON.stringify([...out.values()]);
})()`;

const CLICK = (text) => `(() => {
  const want = ${JSON.stringify(text)};
  const all = [...document.querySelectorAll('*')].filter(e => e.textContent && e.textContent.trim() === want && e.children.length === 0);
  const target = all[0] || [...document.querySelectorAll('*')].filter(e => (e.textContent||'').trim() === want).pop();
  if (!target) return 'not-found';
  target.scrollIntoView({block:'nearest'});
  target.click();
  return 'clicked:' + target.tagName;
})()`;

// 找元素中心点，供真实鼠标事件使用
const CENTER = (text) => `(() => {
  const want = ${JSON.stringify(text)};
  const cands = [...document.querySelectorAll('*')].filter(e => e.textContent && e.textContent.trim() === want && e.children.length === 0);
  const el = cands[0] || [...document.querySelectorAll('*')].filter(e => (e.textContent||'').trim() === want).pop();
  if (!el) return null;
  el.scrollIntoView({block:'nearest'});
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), tag: el.tagName };
})()`;

async function mouseAt(x, y, button = 'left') {
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: button === 'right' ? 2 : 1, clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 });
}

for (const a of actions) {
  if (a === 'labels') {
    const raw = await evaluate(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, [role="button"], a[href]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const lab = (el.getAttribute('aria-label') || '').trim();
        const ti = (el.getAttribute('title') || '').trim();
        const tx = (el.textContent || '').trim().slice(0, 40);
        if (!lab && !ti && !tx) continue;
        out.push({ label: lab, title: ti, text: tx });
      }
      return JSON.stringify(out);
    })()`);
    console.log(typeof raw === 'string' ? raw : JSON.stringify(raw));
  } else if (a.startsWith('clicklabel:')) {
    const want = a.slice(11);
    const res = await evaluate(`(() => {
      const want = ${JSON.stringify(want)};
      const els = [...document.querySelectorAll('button, [role="button"], a[href]')];
      const hit = els.find(el => ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).includes(want));
      if (!hit) return 'not-found';
      hit.click();
      return 'clicked';
    })()`);
    console.log(`clicklabel ${JSON.stringify(want)} -> ${res}`);
  } else if (a.startsWith('rclick:')) {
    const t = a.slice(7);
    const c = await evaluate(CENTER(t));
    if (!c) { console.log(`rclick ${JSON.stringify(t)} -> not-found`); continue; }
    await mouseAt(c.x, c.y, 'right');
    await new Promise(r => setTimeout(r, 400));
    const fired = await evaluate(`(() => {
      const el = document.elementFromPoint(${c.x}, ${c.y});
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${c.x}, clientY: ${c.y}, button: 2 }));
      return true;
    })()`);
    console.log(`rclick ${JSON.stringify(t)} -> at ${c.x},${c.y} synthetic=${fired}`);
  } else if (a.startsWith('hover:')) {
    const t = a.slice(6);
    const c = await evaluate(CENTER(t));
    if (!c) { console.log(`hover ${JSON.stringify(t)} -> not-found`); continue; }
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none', buttons: 0 });
    await new Promise(r => setTimeout(r, 400));
    console.log(`hover ${JSON.stringify(t)} -> at ${c.x},${c.y}`);
  } else if (a.startsWith('key:')) {
    const key = a.slice(4);
    const vk = key === 'Escape' ? 27 : key === 'Enter' ? 13 : 0;
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: vk });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk });
    await new Promise(r => setTimeout(r, 300));
    console.log(`key ${key}`);
  } else if (a === 'dump') {
    const raw = await evaluate(DUMP);
    console.log(typeof raw === 'string' ? raw : JSON.stringify(raw));
  } else if (a.startsWith('click:')) {
    const t = a.slice(6);
    console.log(`click ${JSON.stringify(t)} -> ` + await evaluate(CLICK(t)));
  } else if (a.startsWith('shot:')) {
    const f = a.slice(5);
    await new Promise(r => setTimeout(r, 500));
    const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
    if (shot?.result?.data) { await writeFile(f, Buffer.from(shot.result.data, 'base64')); console.log(`shot -> ${f}`); }
    else console.log('shot failed');
  } else if (a.startsWith('wait:')) {
    await new Promise(r => setTimeout(r, Number(a.slice(5))));
  } else if (a.startsWith('eval:')) {
    console.log(JSON.stringify(await evaluate(a.slice(5))));
  }
}
ws.close();
process.exit(0);