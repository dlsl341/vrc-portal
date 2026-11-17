const W=window;let cbs=[];
export function getAuth(){return {}}
export class GoogleAuthProvider{}
export function onAuthStateChanged(a,cb){cbs.push(cb);setTimeout(()=>cb(W.__USER||null),10);return()=>{}}
export async function signInWithPopup(){W.__USER=W.__NEXTUSER;cbs.forEach(cb=>cb(W.__USER));return {user:W.__USER}}
export async function signOut(){W.__USER=null}
export async function sendSignInLinkToEmail(a,e){W.__LINKSENT=e}
export function isSignInWithEmailLink(){return false}
export async function signInWithEmailLink(){}
