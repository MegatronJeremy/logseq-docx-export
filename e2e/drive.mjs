const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
async function conn(url) {
  const ws = new WebSocket(url); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 1; const pend = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend[d.id]) pend[d.id](d); };
  const send = (method, params = {}) => new Promise((r) => { const i = id++; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const d = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return d.result?.result?.value ?? JSON.stringify(d.result ?? d.error); };
  return { ws, send, ev };
}
// 1. main process: stub the folder dialog so "open a local directory" picks our graph
let main;
for (let i = 0; i < 30; i++) { try { const t = await (await fetch("http://127.0.0.1:9229/json")).json(); main = await conn(t[0].webSocketDebuggerUrl); break; } catch { await sleep(1000); } }
if (main) {
  const home = process.env.HOME;
  log("main patch", await main.ev(`(()=>{const r=process.mainModule.require; const require=r; const {dialog}=r('electron'); dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(home + "/graph")}]}); dialog.showSaveDialog=async(w,o)=>({canceled:false,filePath:${JSON.stringify(home + "/Downloads/")}+((o||w||{}).defaultPath||'export.docx').split('/').pop()}); require('electron').session.defaultSession.on('will-download',(e,item)=>{item.setSavePath(${JSON.stringify(home + "/Downloads/")}+item.getFilename())}); dialog.showOpenDialogSync=()=>[${JSON.stringify(home + "/graph")}]; dialog.showSaveDialogSync=(w,o)=>${JSON.stringify(home + "/Downloads/")}+(((o||w||{}).defaultPath)||'export.docx').split('/').pop(); return 'ok '+process.versions.electron})()`));
} else log("NO MAIN INSPECTOR (cannot stub dialog)");
// 2. renderer
let page;
for (let i = 0; i < 60 && !page; i++) {
  try { const ts = await (await fetch("http://127.0.0.1:9222/json")).json(); page = ts.find((t) => t.type === "page"); } catch {}
  if (!page) await sleep(2000);
}
log("page", page?.title, page?.url);
const r = await conn(page.webSocketDebuggerUrl);
await r.send("Page.enable");
await r.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: process.env.HOME + "/Downloads" }).then((d) => log("dl behaviour", JSON.stringify(d.error ?? "ok")));
await sleep(8000);
log("body text", (await r.ev("document.body.innerText.slice(0,400)")));
log("buttons", await r.ev("JSON.stringify([...document.querySelectorAll('button,a,div[role=button]')].map(b=>b.innerText.trim()).filter(Boolean).slice(0,30))"));
const clickText = async (re) => {
  const pos = await r.ev(`(()=>{const els=[...document.querySelectorAll('button,a,div,span')].filter(e=>${re}.test((e.innerText||'').trim()) && e.getBoundingClientRect().width>0); els.sort((a,b)=>(a.innerText.length-b.innerText.length)); const e=els[0]; if(!e) return null; const b=e.getBoundingClientRect(); return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2,t:e.innerText.slice(0,40)})})()`);
  if (!pos || pos.startsWith('{"result"')) return "none";
  const p = JSON.parse(pos);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await r.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", clickCount: 1 });
  return "clicked " + p.t;
};
log("html", await r.ev("(()=>{const e=[...document.querySelectorAll('*')].filter(x=>/^Choose a folder/.test((x.innerText||'').trim())).pop(); let p=e, out=[]; for(let i=0;i<5&&p;i++){out.push(p.tagName+'.'+p.className+' | '+(p.getAttribute('onclick')||'')); p=p.parentElement} return out.join('\\n')})()"));
log("click open dir", await clickText("/^Choose a folder/i"));
await sleep(3000);
log("after mouse click repo", await r.ev("localStorage.getItem('git/current-repo')"));
log("dom clicks", await r.ev("(()=>{const e=[...document.querySelectorAll('*')].filter(x=>/^Choose a folder/.test((x.innerText||'').trim())).pop(); let p=e, n=0; while(p && n<4){p.click(); p=p.parentElement; n++} return 'ok'})()"));
await sleep(5000);
log("apis", await r.ev("typeof window.apis + ' ' + Object.keys(window.apis||{}).join(',')"));
await sleep(10000);
log("modal/other", await r.ev("document.body.innerText.slice(0,200)"));
log("after open", await r.ev("document.body.innerText.slice(0,300)"));
log("repo", await r.ev("localStorage.getItem('git/current-repo')"));
log("plugins", await r.ev("typeof LSPluginCore!=='undefined' ? JSON.stringify([...LSPluginCore.registeredPlugins.keys()]) : 'no LSPluginCore'"));
await r.ev("location.hash='#/page/Demo%20Page'");
await sleep(5000);
log("page body", await r.ev("document.querySelector('#main-content-container')?.innerText.slice(0,500)"));
log("plugins2", await r.ev("typeof LSPluginCore!=='undefined' ? JSON.stringify([...LSPluginCore.registeredPlugins.entries()].map(([k,v])=>[k,v._status||v.status])) : 'none'"));
log("imgs", await r.ev("JSON.stringify([...document.querySelectorAll('img')].map(i=>i.src).filter(x=>x.includes('pic')))"));
log("host fetch", await r.ev("(async()=>{const out=[]; for(const u of ['assets://'+'/home/daytona/graph/assets/pic.png','file:///home/daytona/graph/assets/pic.png']){try{const x=await fetch(u); out.push(u+' '+x.status+' '+(await x.arrayBuffer()).byteLength)}catch(e){out.push(u+' ERR '+e.message)}} return out.join(' ; ')})()"));
log("targets", JSON.stringify((await (await fetch("http://127.0.0.1:9222/json")).json()).map((t) => t.type + ":" + t.url.slice(0, 70))));
// 2b. probe from inside the plugin iframe (its own origin): which asset URL can the plugin actually fetch?
try {
  const ts = await (await fetch("http://127.0.0.1:9222/json")).json();
  const fr = ts.find((t) => t.url.includes("logseq-docx-export"));
  if (fr) {
    const f = await conn(fr.webSocketDebuggerUrl);
    log("iframe probe", await f.ev(`(async()=>{const out=[]; const g='${process.env.HOME}/graph';
      const urls=['assets://'+g+'/assets/pic.png','file://'+g+'/assets/pic.png'];
      try{ const m=await logseq.Assets.makeUrl('assets/pic.png'); out.push('makeUrl='+m); urls.unshift(m)}catch(e){out.push('makeUrl ERR '+e.message)}
      try{ const h=logseq.Experiments.ensureHostScope(); const x=await h.fetch('file://'+g+'/assets/pic.png'); out.push('HOST file:// '+x.status+' '+(await x.arrayBuffer()).byteLength)}catch(e){out.push('HOST ERR '+e.message)}
      for(const u of urls){try{const x=await fetch(u); out.push(u+' '+x.status+' '+(await x.arrayBuffer()).byteLength)}catch(e){out.push(u+' ERR '+e.message)}}
      try{ out.push('XHR '+await new Promise((res,rej)=>{const x=new XMLHttpRequest(); x.open('GET',urls[0]); x.responseType='arraybuffer'; x.onload=()=>res(x.status+' '+(x.response?x.response.byteLength:0)); x.onerror=()=>rej(new Error('xhr error')); x.send()}))}catch(e){out.push('XHR ERR '+e.message)}
      try{ out.push('IMG '+await new Promise((res,rej)=>{const i=new Image(); i.onload=()=>{try{const c=document.createElement('canvas'); c.width=i.naturalWidth; c.height=i.naturalHeight; c.getContext('2d').drawImage(i,0,0); res('loaded '+i.naturalWidth+'x'+i.naturalHeight+' canvas bytes '+atob(c.toDataURL('image/png').split(',')[1]).length)}catch(e){res('loaded '+i.naturalWidth+'x'+i.naturalHeight+' canvas ERR '+e.message)}}; i.onerror=()=>rej(new Error('img error')); i.src=urls[0]}))}catch(e){out.push('IMG ERR '+e.message)}
      return out.join(' ; ')})()`));
  } else log("iframe probe: no iframe target");
} catch (e) { log("iframe probe failed", String(e)); }
// 2c. build 5 probe: raw block text and per-name XHR results from the iframe
try {
  const ts2 = await (await fetch("http://127.0.0.1:9222/json")).json();
  const fr2 = ts2.find((t) => t.url.includes("logseq-docx-export"));
  if (fr2) {
    const f2 = await conn(fr2.webSocketDebuggerUrl);
    log("blocks", await f2.ev(`(async()=>{const t=await logseq.Editor.getPageBlocksTree('Demo Page'); const o=[]; const w=(b)=>{o.push(JSON.stringify(b.content)); (b.children||[]).forEach(w)}; t.forEach(w); return o.join('\\n')})()`));
    log("names probe", await f2.ev(`(async()=>{const g='${process.env.HOME}/graph/assets/'; const out=[]; const x=(u)=>new Promise((res)=>{try{const q=new XMLHttpRequest(); q.open('GET',u); q.responseType='arraybuffer'; q.onload=()=>res(q.status+' '+(q.response?q.response.byteLength:0)); q.onerror=()=>res('ERR'); q.send()}catch(e){res('THROW '+e.message)}});
      for(const n of ['Zoë diagram.png','spaced name.png','Zoë.png','my photo 1.jpg','anim.gif','logo.svg']){ for(const [k,u] of [['assets-enc','assets://'+encodeURI(g+n)],['assets-raw','assets://'+g+n],['file-enc','file://'+encodeURI(g+n)],['file-raw','file://'+g+n]]) out.push(n+' '+k+' '+await x(u)); try{out.push(n+' makeUrl '+await logseq.Assets.makeUrl('assets/'+n))}catch(e){out.push('mk ERR '+e.message)} }
      return out.join('\\n')})()`));
  }
} catch (e) { log("probe2 failed", String(e)); }
// 3. run the export through the page menu item the plugin registered (registerPageMenuItem)
await r.ev("document.activeElement.blur && document.activeElement.blur()");
await r.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await r.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(1000);
log("dots", await r.ev("JSON.stringify([...document.querySelectorAll('.toolbar-dots-btn, [class*=dots], #head .more, button[title]')].map(e=>e.className+'|'+e.title).slice(0,10))"));
log("open menu", await r.ev("(()=>{const b=document.querySelector('.toolbar-dots-btn'); if(!b) return 'no btn'; b.click(); return 'clicked'})()"));
await sleep(1500);
log("menu items", await r.ev("JSON.stringify([...document.querySelectorAll('.menu-link,[role=menuitem],.ui__dropdown-menu-item,a')].map(e=>e.innerText.trim()).filter(Boolean).slice(0,40))"));
log("click export", await r.ev("(()=>{const e=[...document.querySelectorAll('*')].filter(x=>/^Export page to \\.docx/.test((x.innerText||'').trim())); if(!e.length) return 'none'; const t=e[e.length-1]; t.click(); return 'clicked '+t.tagName})()"));
await sleep(8000);
log("notifications", await r.ev("JSON.stringify([...document.querySelectorAll('[class*=notification]')].map(n=>n.innerText.slice(0,200)))"));
process.exit(0);
