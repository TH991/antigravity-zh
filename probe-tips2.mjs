// 真实鼠标点击打开模型下拉，然后把鼠标移到 ⓘ 上，抓取详情浮层
const port = process.argv[2] || '9223'
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = list.filter(t => /Antigravity|workbench|127\.0\.0\.1:/.test(t.url + t.title)).pop()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value
const sleep = ms => new Promise(r => setTimeout(r, ms))
await new Promise(r => { ws.onopen = r })

const moveTo = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
}

const trig = await evalJs(`(() => {
  const b = [...document.querySelectorAll('[aria-label]')].find(e => /Select model/i.test(e.getAttribute('aria-label')));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
})()`)
console.log('trigger:', trig)
if (!trig) process.exit(1)
const t = JSON.parse(trig)
await clickAt(t.x, t.y)
await sleep(1000)

const rows = await evalJs(`JSON.stringify([...document.querySelectorAll('[role="menuitem"]')].map(m => {
  const r = m.getBoundingClientRect();
  const icons = [...m.querySelectorAll('svg')].map(s => { const ir = s.getBoundingClientRect(); return { x: ir.left + ir.width / 2, y: ir.top + ir.height / 2, w: ir.width } }).filter(i => i.w > 0);
  return { text: (m.textContent || '').replace(/\\s+/g, ' ').slice(0, 26), x: r.left, y: r.top, w: r.width, icons };
}))`)
console.log('rows:', rows)
const list2 = JSON.parse(rows || '[]')
const targetRow = list2.find(r => /即将下线/.test(r.text))
if (!targetRow) { console.log('no deprecation row'); process.exit(2) }
const icon = targetRow.icons.filter(i => i.x > targetRow.x + 100)[0]
console.log('hover icon at', icon)
await moveTo(icon.x, icon.y)
await sleep(1500)
const tips = await evalJs(`JSON.stringify([...document.querySelectorAll('[role="tooltip"],[data-radix-popper-content-wrapper],[class*="tooltip"],[class*="Tooltip"]')].map(n => (n.textContent || '').trim()).filter(Boolean))`)
console.log('tips:', tips)
await send('Page.captureScreenshot', { format: 'png' }).then(async r => {
  const fs = await import('node:fs')
  fs.writeFileSync('zh-tip.png', Buffer.from(r.result.data, 'base64'))
  console.log('screenshot: zh-tip.png')
})
process.exit(0)