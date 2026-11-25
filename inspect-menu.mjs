// 假设模型下拉已打开：列出可点行的结构
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
  const rows = [...document.querySelectorAll('*')].filter(e => e.children.length <= 6 && /Claude Opus|Claude Sonnet|GPT-OSS/.test(e.textContent || ''));
  return JSON.stringify(rows.slice(0, 12).map(e => ({ tag: e.tagName, role: e.getAttribute('role'), cls: String(e.className).slice(0, 90), text: (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60) })));
})()`)
console.log(info)
process.exit(0)