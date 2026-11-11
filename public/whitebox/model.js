import {defaults,referenceDefaults,validate} from './core.js';
export const themeIds=['raven-wizard','paper-lavender','peach'];
export const sharedCardKeys=['cardX','cardY','cardW','cardH','cardGap','cardLift'];
const copy=x=>JSON.parse(JSON.stringify(x));
export function freshProfile(){return {layout:{...defaults},defaults:copy(referenceDefaults),saved:[]};}
export function freshDocument(){return {version:3,revision:0,activeTheme:'raven-wizard',profiles:Object.fromEntries(themeIds.map(t=>[t,freshProfile()]))};}
export function cleanProfile(input){
 const result=freshProfile();if(!input)return result;
 result.layout=validate(input.layout||{});
 result.saved=Array.isArray(input.saved)?input.saved.slice(0,100).filter(x=>typeof x.id==='string'&&typeof x.name==='string').map(x=>({id:x.id.slice(0,100),name:x.name.slice(0,36),state:validate(x.state||{})})):[];
 for(const group of Object.keys(referenceDefaults))for(const key of Object.keys(referenceDefaults[group])){
  const value=validate({...defaults,...referenceDefaults[group][key],...input.defaults?.[group]?.[key]});
  result.defaults[group][key]=Object.fromEntries(Object.keys(referenceDefaults[group][key]).map(k=>[k,value[k]]));
 }
 for(const k of sharedCardKeys)result.defaults.cards.orbit[k]=result.defaults.cards.inner[k];
 result.defaults.cards.inner.cardShape=result.defaults.cards.inner.cardShape==='arch'?'round':result.defaults.cards.inner.cardShape;
 return result;
}
export function cleanDocument(input){const d=freshDocument();if(!input||input.version!==3)return d;d.revision=Number.isSafeInteger(input.revision)?input.revision:0;d.activeTheme=themeIds.includes(input.activeTheme)?input.activeTheme:d.activeTheme;for(const t of themeIds)d.profiles[t]=cleanProfile(input.profiles?.[t]);return d;}
export function reduceOperation(doc,op){
 const d=copy(doc);if(!themeIds.includes(op.theme))throw Error('未知 UI 套装');
 const p=d.profiles[op.theme];
 if(op.type==='theme')d.activeTheme=op.theme;
 else if(op.type==='layout')p.layout=validate({...p.layout,...op.patch});
 else if(op.type==='profile')d.profiles[op.theme]=cleanProfile(op.profile);
 else if(op.type==='saveLayout'){if(typeof op.id!=='string'||typeof op.name!=='string')throw Error('无效方案');const item={id:op.id.slice(0,100),name:op.name.slice(0,36),state:validate(op.layout||p.layout)};const index=p.saved.findIndex(x=>x.id===item.id);if(index<0){if(p.saved.length>=100)throw Error('方案已满');p.saved.push(item);}else p.saved[index]=item;}
 else if(op.type==='deleteLayout')p.saved=p.saved.filter(x=>x.id!==op.id);
 else if(op.type==='saveDefault'){
  if(!referenceDefaults[op.group]?.[op.key])throw Error('未知默认方案');
  const values=validate({...p.layout,...op.values});
  p.defaults[op.group][op.key]=Object.fromEntries(Object.keys(referenceDefaults[op.group][op.key]).map(k=>[k,values[k]]));
  const identity={cards:'cardMode',top:'top',ability:'ability'}[op.group];p.defaults[op.group][op.key][identity]=op.key;
  if(op.group==='cards')for(const key of ['inner','orbit'])for(const k of sharedCardKeys)p.defaults.cards[key][k]=values[k];
 }else throw Error('未知操作');
 if(p.layout.cardMode==='inner'&&p.layout.cardShape==='arch')p.layout.cardShape='round';
 d.revision++;return d;
}
