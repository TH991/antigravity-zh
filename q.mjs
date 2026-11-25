const PORT=9223;
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const main=list.filter(t=>t.type==='page'&&/127\.0\.0\.1:|Antigravity/.test(t.url+t.title)).pop();
const ws=new WebSocket(main.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let seq=0;const pend=new Map();
ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id&&pend.has(d.id)){pend.get(d.id)(d);pend.delete(d.id);}};
const call=(m,p={})=>new Promise(r=>{const id=++seq;pend.set(id,r);ws.send(JSON.stringify({id,method:m,params:p}));});
const ev=async x=>{const r=await call('Runtime.evaluate',{expression:x,returnByValue:true});return r.result.result.value;};
const out=await ev(`(()=>{
  const hits=[];
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let n;
  while(n=w.nextNode()){ const t=n.nodeValue.trim(); if(t==='yet'||t==='No'||t==='automations'){ hits.push({text:t, tag:n.parentElement.tagName, cls:String(n.parentElement.className), parentTag:n.parentElement.parentElement.tagName, parentCls:String(n.parentElement.parentElement.className).slice(0,60)}); } }
  return JSON.stringify(hits);
})()`);
console.log(out);
ws.close();process.exit(0);
