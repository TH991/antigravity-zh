// 尝试用合成事件触发 ⓘ 的详情浮层，并抓取浮层文案
const port = process.argv[2] || '9223'
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = list.filter(t => /Antigravity|workbench|127\.0\.0\.1:/.test(t.url + t.title)).pop()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value
await new Promise(r => { ws.onopen = r })

const hook = `(() => {
  window.__tips = [];
  const grab = () => {
    const nodes = [...document.querySelectorAll('[role="tooltip"], [data-radix-popper-content-wrapper], [class*="tooltip"], [class*="Tooltip"]')];
    for (const n of nodes) {
      const t = (n.textContent || '').trim();
      if (t && !window.__tips.includes(t)) window.__tips.push(t);
    }
  };
  setInterval(grab, 150);
  return 'hooked';
})()`
console.log('hook:', await evalJs(hook))

const fire = `(() => {
  const rows = [...document.querySelectorAll('[role="menuitem"]')];
  const out = [];
  for (const row of rows) {
    const badge = [...row.querySelectorAll('span,div')].find(e => /^(即将下线|新|注意)$/.test((e.textContent || '').trim()) && !e.children.length);
    const icons = [...row.querySelectorAll('svg')].map(s => ({ svg: s, r: s.getBoundingClientRect() }));
    const near = icons.filter(i => i.r.width > 0 && i.r.left > row.getBoundingClientRect().left + 100);
    for (const i of near) {
      const r = i.r;
      const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window };
      const el = i.svg.parentElement || i.svg;
      for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove']) {
        el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, opts));
      }
      out.push((row.textContent || '').replace(/\\s+/g, ' ').slice(0, 24));
    }
  }
  return JSON.stringify(out);
})()`
console.log('fired:', await evalJs(fire))
await new Promise(r => setTimeout(r, 1200))
console.log('tips:', await evalJs('JSON.stringify(window.__tips || [])'))
process.exit(0)