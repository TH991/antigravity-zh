// 找出界面上所有「默认」相关元素，以及它们父容器里还没被翻译的英文
const port = process.argv[2] || '9223'
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = list.filter(t => /Antigravity|workbench|127\.0\.0\.1:/.test(t.url + t.title)).pop()
if (!target) { console.error('找不到页面'); process.exit(1) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
ws.onopen = async () => {
  const script = `(() => {
    const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' };
    const out = { defaultBlocks: [], leftovers: [] };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let el;
    while ((el = walker.nextNode())) {
      const t = (el.textContent || '').trim();
      if (!t || !vis(el)) continue;
      if (t.startsWith('默认') && t.length < 60 && el.children.length < 6) {
        out.defaultBlocks.push({
          tag: el.tagName, cls: String(el.className).slice(0, 70), text: t.slice(0, 80),
          parentText: el.parentElement ? String(el.parentElement.innerText || '').replace(/\\s+/g, ' ').slice(0, 160) : ''
        });
      }
    }
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (!t || !/[A-Za-z]{2,}/.test(t)) continue;
      const p = n.parentElement;
      if (!p || !vis(p)) continue;
      if (p.closest('code,pre,.monaco-editor,textarea,[contenteditable="true"],.markdown-body,.chat-message,.composer')) continue;
      out.leftovers.push({ text: t.slice(0, 90), cls: String(p.className).slice(0, 60) });
    }
    return JSON.stringify(out);
  })()`
  const r = await send('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true })
  const v = r.result?.result?.value
  console.log(v || JSON.stringify(r.result))
  process.exit(0)
}
setTimeout(() => { console.error('超时'); process.exit(2) }, 15000)