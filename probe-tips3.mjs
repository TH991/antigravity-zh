import { writeFileSync } from 'node:fs'
const port = process.argv[2] || '9223'
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = list.filter(t => /Antigravity|workbench|127\.0\.0\.1:/.test(t.url + t.title)).pop()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0; const pending = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value
const sleep = ms => new Promise(r => setTimeout(r, ms))
await new Promise(r => { ws.onopen = r })
const moveTo = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
const clickAt = async (x, y) => { await moveTo(x, y); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }) }
const rowCount = () => evalJs(`document.querySelectorAll('[role="menuitem"]').length`)
const trig = JSON.parse(await evalJs(`(() => { const b=[...document.querySelectorAll('[aria-label]')].find(e=>/Select model/i.test(e.getAttribute('aria-label'))); if(!b) return 'null'; const r=b.getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2}); })()`))
if ((await rowCount()) === 0) { await clickAt(trig.x, trig.y); await sleep(900) }
const rows = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll('[role="menuitem"]')].map(m => { const r=m.getBoundingClientRect(); const icons=[...m.querySelectorAll('svg')].map(s=>{const ir=s.getBoundingClientRect(); return {x:ir.left+ir.width/2,y:ir.top+ir.height/2,w:ir.width}}).filter(i=>i.w>0); return {text:(m.textContent||'').replace(/\\s+/g,' ').slice(0,24), x:r.left, icons}; }))`))
const tipText = `(() => { const ns=[...document.querySelectorAll('[role="tooltip"],[data-radix-popper-content-wrapper],[class*="tooltip"],[class*="Tooltip"]')]; return ns.map(n=>(n.textContent||'').trim()).filter(Boolean).pop()||''; })()`
const out = []
for (const row of rows) {
  const icon = row.icons.filter(i => i.x > row.x + 100)[0]
  if (!icon) { out.push({ row: row.text, tip: '(无图标)' }); continue }
  await moveTo(icon.x, icon.y); await sleep(1200)
  out.push({ row: row.text, tip: await evalJs(tipText) })
  await moveTo(5, 5); await sleep(250)
}
console.log(JSON.stringify(out, null, 1))
process.exit(0)
