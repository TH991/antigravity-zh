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
const b = JSON.parse(await evalJs(`(() => { const e=[...document.querySelectorAll('span,div')].find(n => !n.children.length && (n.textContent||'').trim()==='即将下线'); const r=e.getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2}); })()`))
await moveTo(b.x, b.y)
await sleep(1600)
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false })
writeFileSync('zh-tip2.png', Buffer.from(shot.result.data, 'base64'))
console.log('saved zh-tip2.png')
process.exit(0)
