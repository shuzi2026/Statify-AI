import {freshDocument,cleanDocument,reduceOperation} from './model.js';
const storageKey='statify-ui-layout-v3',listeners=new Set();
let doc=freshDocument(),pending=[],running=false,started=false,ready=false,status='正在连接',timer,hasCache=false,confirmedRevision=-1;
try{hasCache=!!localStorage.getItem(storageKey);doc=cleanDocument(JSON.parse(localStorage.getItem(storageKey)));pending=JSON.parse(localStorage.getItem(storageKey+'-queue')||'[]');if(!Array.isArray(pending))pending=[];}catch{}
const endpoint=typeof location!=='undefined'&&location.port==='8765'?'http://127.0.0.1:5184/__ui/layout':'/__ui/layout';
const channel=typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'?new BroadcastChannel(storageKey):null;
const notify=()=>{for(const fn of listeners)fn();};
function cache(){try{localStorage.setItem(storageKey,JSON.stringify(doc));localStorage.setItem(storageKey+'-queue',JSON.stringify(pending));}catch{}notify();}
export const snapshot=()=>doc;
export const syncStatus=()=>status;
export const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
async function request(options){const r=await fetch(endpoint,{...options,signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error('同步失败');return cleanDocument(await r.json());}
async function flush(){
 if(running||!ready||!pending.length)return;running=true;
 try{while(pending.length){const current=pending[0],next=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(current)});pending.shift();confirmedRevision=next.revision;doc=pending.reduce(reduceOperation,next);status=pending.length?'正在同步':'已同步';cache();}channel?.postMessage({type:'changed'});}
 catch{status='本机已保存 · 等待连接同步';cache();}
 finally{running=false;}
}
async function pull(){if(running)return;try{const next=await request();if(next.revision<confirmedRevision)return;ready=true;confirmedRevision=next.revision;const value=pending.reduce(reduceOperation,next),nextStatus=pending.length?'正在同步':'已同步';if(JSON.stringify(value)!==JSON.stringify(doc)||status!==nextStatus){doc=value;status=nextStatus;cache();}void flush();}catch{ready=false;if(!hasCache){try{const r=await fetch(new URL('./defaults.json',import.meta.url));if(r.ok){doc=pending.reduce(reduceOperation,cleanDocument(await r.json()));hasCache=true;cache();}}catch{}}status='本机已保存 · 等待连接同步';notify();}}
export function startSync(){if(started)return;started=true;void pull();timer=setInterval(()=>void pull(),1200);channel?.addEventListener('message',e=>{if(e.data?.type==='changed')void pull();});}
export function commit(op){doc=reduceOperation(doc,op);pending.push(op);status='正在同步';cache();void flush();}
export function updateLayout(patch,theme=doc.activeTheme){commit({type:'layout',theme,patch});}
export function setActiveTheme(theme){if(theme!==doc.activeTheme)commit({type:'theme',theme});}
export function applyDefault(group,key,theme=doc.activeTheme){updateLayout(doc.profiles[theme].defaults[group][key],theme);}
export function saveDefault(group,key,values,theme=doc.activeTheme){commit({type:'saveDefault',theme,group,key,values});}
export function dispose(){clearInterval(timer);channel?.close();}
