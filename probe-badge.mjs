// 检查「新建/新」角标所在的 DOM 位置
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
const info = await evalJs(`(() => {
  const badges = [...document.querySelectorAll('*')].filter(e => !e.children.length && /^(新建|新)$/.test((e.textContent||'').trim()));
  return JSON.stringify(badges.map(e => ({
    text: e.textContent.trim(), tag: e.tagName, cls: String(e.className).slice(0, 40),
    parentTag: e.parentElement.tagName, parentCls: String(e.parentElement.className).slice(0, 50),
    inMenuItem: !!(e.closest('[role="menuitem"]')),
    rowText: (e.closest('[role="menuitem"]')?.textContent || e.parentElement.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
  })));
})()`)
console.log(info)
process.exit(0)