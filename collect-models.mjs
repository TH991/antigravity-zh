// 逐个悬停模型行，把右侧描述文案抓出来：node collect-models.mjs [port]
const port = process.argv[2] || '9223'
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = list.filter(t => /Antigravity|workbench|127\.0\.0\.1:/.test(t.url + t.title)).pop()
if (!target) { console.error('找不到页面'); process.exit(1) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 200))
  return r.result?.result?.value
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
await new Promise(res => { ws.onopen = res })
// 假定下拉已经打开（先用 drive.mjs clicklabel:Select model 打开；程序内 .click() 不触发 React）

await evalJs(`(() => {
  const btn = [...document.querySelectorAll('[aria-label="Select model"]')][0];
  if (btn) btn.click();
  return true;
})()`)
await sleep(800)

const rows = JSON.parse(await evalJs(`(() => {
  const items = [...document.querySelectorAll('[role="menuitem"]')].filter(el => /Gemini|Claude|GPT|Orchestrator/.test(el.textContent));
  return JSON.stringify(items.map((el, i) => ({ i, text: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40) })));
})()`))
console.log('模型行数:', rows.length)

const out = []
for (const row of rows) {
  await evalJs(`(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')].filter(el => /Gemini|Claude|GPT|Orchestrator/.test(el.textContent));
    const el = items[${row.i}];
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) });
  })()`).then(async pt => {
    try {
      const { x, y } = JSON.parse(pt)
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 })
    } catch {}
  })
  await sleep(700)
  const desc = await evalJs(`(() => {
    const el = [...document.querySelectorAll('div')].find(d => /max-w-\\[200px\\]/.test(String(d.className)) && d.textContent.trim());
    return el ? el.textContent.trim().replace(/\\s+/g, ' ') : '';
  })()`)
  out.push({ model: row.text, desc })
  console.log(`- ${row.text}  =>  ${desc}`)
}

const fs = await import('node:fs')
fs.writeFileSync('model-descs.json', JSON.stringify(out, null, 2))
console.log('已写 model-descs.json')
process.exit(0)