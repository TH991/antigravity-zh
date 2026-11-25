// 列出当前下拉里每一行的几何信息，供真实鼠标悬停定位
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

const dump = await evalJs(`JSON.stringify({
  dpr: devicePixelRatio, w: innerWidth, h: innerHeight,
  rows: [...document.querySelectorAll('[role="menuitem"]')].map(m => {
    const r = m.getBoundingClientRect();
    const icons = [...m.querySelectorAll('svg,[aria-label],[title]')].map(i => {
      const ir = i.getBoundingClientRect();
      return { label: i.getAttribute('aria-label') || i.getAttribute('title') || i.tagName, x: Math.round(ir.left + ir.width / 2), y: Math.round(ir.top + ir.height / 2) };
    });
    return { text: (m.textContent || '').replace(/\\s+/g, ' ').slice(0, 30), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), icons };
  })
})`)
console.log(dump)
process.exit(0)