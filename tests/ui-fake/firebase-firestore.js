const W=window;const store=W.__STORE||(W.__STORE={});const listeners=new Set();let seq=0;
const segs=(base,parts)=>[...(base&&base.path?base.path.split('/'):[]),...parts.flatMap(p=>String(p).split('/'))];
const mkRef=(path)=>{const p=path.split('/');return p.length%2===0?{type:'doc',path,id:p[p.length-1]}:{type:'col',path,id:p[p.length-1]}};
export function initializeFirestore(){return {path:''}}
export function doc(base,...parts){if(base.type==='col'&&parts.length===0)return mkRef(base.path+'/auto'+(++seq)+Math.random().toString(36).slice(2,8));return mkRef(segs(base,parts).join('/'))}
export function collection(base,...parts){return mkRef(segs(base,parts).join('/'))}
export function query(q){return q}export const where=()=>0,orderBy=()=>0,limit=()=>0;
const snapD=r=>({id:r.id,exists:()=>store[r.path]!==undefined,data:()=>store[r.path]&&JSON.parse(JSON.stringify(store[r.path])),metadata:{fromCache:false,hasPendingWrites:false}});
const inCol=(c)=>Object.keys(store).filter(k=>{const i=k.lastIndexOf('/');return k.slice(0,i)===c.path}).sort();
const snapQ=c=>{const docs=inCol(c).map(k=>snapD(mkRef(k)));return {docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false},docChanges:()=>[]}};
const notify=()=>setTimeout(()=>listeners.forEach(l=>l()),0);
const deny=(op,path)=>{if(W.__DENY&&W.__DENY(op,path)){const e=new Error('Missing or insufficient permissions.');e.code='permission-denied';throw e}};
export async function getDoc(r){deny('get',r.path);return snapD(r)}
export async function getDocs(c){return snapQ(c)}
export async function setDoc(r,d){deny('set',r.path);store[r.path]=JSON.parse(JSON.stringify(d));(W.__W=W.__W||[]).push(['set',r.path,d]);notify()}
export async function updateDoc(r,d){deny('update',r.path);if(store[r.path]===undefined){const e=new Error('No document');e.code='not-found';throw e}const dd=JSON.parse(JSON.stringify(d));for(const [k,v] of Object.entries(dd)){const ks=k.split('.');let o=store[r.path];ks.slice(0,-1).forEach(x=>{o=o[x]=(o[x]&&typeof o[x]==='object')?o[x]:{}});o[ks[ks.length-1]]=v}(W.__W=W.__W||[]).push(['update',r.path,d]);notify()}
export async function deleteDoc(r){deny('delete',r.path);delete store[r.path];(W.__W=W.__W||[]).push(['delete',r.path]);notify()}
export async function addDoc(c,d){const r=doc(c);await setDoc(r,d);return r}
export function onSnapshot(r,next,err){const fire=()=>{try{if(r.type==='doc'){deny('get',r.path);next(snapD(r))}else{deny('list',r.path);next(snapQ(r))}}catch(e){err&&err(e);listeners.delete(fire)}};listeners.add(fire);setTimeout(fire,5);return()=>listeners.delete(fire)}
