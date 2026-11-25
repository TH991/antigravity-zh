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
if ((await evalJs(`document.querySelectorAll('[role="menuitem"]').length`)) === 0) {
  const t = JSON.parse(await evalJs(`(() => { const b=[...document.querySelectorAll('[aria-label]')].find(e=>/Select model/i.test(e.getAttribute('aria-label'))); const r=b.getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2}); })()`))
  await clickAt(t.x, t.y); await sleep(900)
}
const tipText = `(() => { const ns=[...document.querySelectorAll('[role="tooltip"],[data-radix-popper-content-wrapper],[class*="tooltip"],[class*="Tooltip"]')]; return ns.map(n=>(n.textContent||'').trim()).filter(Boolean).pop()||''; })()`
const badges = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll('span,div')].filter(e => !e.children.length && /^(即将下线|新|注意)$/.test((e.textContent||'').trim())).map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), x: r.left + r.width/2, y: r.top + r.height/2, row: (e.closest('[role="menuitem"]')?.textContent||'').replace(/\\s+/g,' ').slice(0,22) }; }))`))
const out = []
for (const b of badges.slice(0, 4)) {
  await moveTo(b.x, b.y); await sleep(1200)
  out.push({ badge: b.t, row: b.row, tip: await evalJs(tipText) })
  await moveTo(5, 5); await sleep(250)
}
console.log(JSON.stringify(out, null, 1))
process.exit(0)
