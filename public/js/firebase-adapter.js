// Firebase adapter for the VRC Rowing Portal.
//
// The portal's app code (index.html) talks to its backend through a small interface:
//   const db = await claude.use('db')        – documents & live queries
//   const user = await claude.use('user')    – who is signed in and what they may do
//   const assets = await claude.use('assets')– photo uploads
//   const downloads = await claude.use('downloads') – calendar files
// That interface came from the original claude.ai version. This file implements it on top of
// Firebase Auth, Firestore and Cloud Storage, and adds the sign-in screen and first-run setup.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  onSnapshot, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = initializeFirestore(app, { ignoreUndefinedProperties: true });
const storage = getStorage(app);

const state = { user: null, settings: null, isOwner: false, isAdmin: false, isMember: false, memberId: null };
let readyResolve; const ready = new Promise(r => (readyResolve = r));
const EMAIL_KEY = 'vrcSignInEmail';

/* ------------------------------------------------------------------ errors */
// Map Firestore/Storage errors onto the codes the app already understands.
function mapErr(e) {
  const c = (e && e.code) || '';
  if (c === 'permission-denied' || c === 'storage/unauthorized') return { code: 'invalid_argument', message: e.message };
  if (c === 'unavailable' || c === 'deadline-exceeded') return { code: 'unavailable', message: e.message };
  if (c === 'resource-exhausted' || c === 'storage/quota-exceeded') return { code: 'quota_exceeded', message: e.message };
  if (c === 'not-found') return { code: 'invalid_argument', message: e.message };
  return { code: 'upstream_error', message: (e && e.message) || String(e) };
}
const wrapP = p => p.catch(e => { throw mapErr(e); });

/* ------------------------------------------------------------------ db */
const snapDoc = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
const snapQuery = s => ({ docs: s.docs.map(snapDoc), size: s.size, empty: s.empty, metadata: s.metadata, docChanges: () => s.docChanges() });
function wrapDoc(r) {
  return {
    id: r.id, path: r.path,
    get: () => wrapP(getDoc(r).then(snapDoc)),
    set: (d, opts) => wrapP(opts ? setDoc(r, d, opts) : setDoc(r, d)),   // opts e.g. { merge: true }
    update: d => wrapP(updateDoc(r, d)),
    delete: () => wrapP(deleteDoc(r)),
    onSnapshot: (next, err) => onSnapshot(r, s => next(snapDoc(s)), e => err && err(mapErr(e))),
    collection: p => wrapCol(collection(r, p))
  };
}
function wrapQuery(q) {
  return {
    where: (f, o, v) => wrapQuery(query(q, where(f, o, v))),
    orderBy: (f, d) => wrapQuery(query(q, orderBy(f, d))),
    limit: n => wrapQuery(query(q, limit(n))),
    get: () => wrapP(getDocs(q).then(snapQuery)),
    onSnapshot: (next, err) => onSnapshot(q, s => next(snapQuery(s)), e => err && err(mapErr(e)))
  };
}
function wrapCol(c) {
  return Object.assign(wrapQuery(c), {
    path: c.path,
    doc: id => wrapDoc(id ? doc(c, id) : doc(c)),
    add: d => wrapP(addDoc(c, d).then(wrapDoc))
  });
}
const dbApi = Object.freeze({ doc: p => wrapDoc(doc(fs, p)), collection: p => wrapCol(collection(fs, p)) });

/* ------------------------------------------------------------------ user */
const profileCache = {};
const userApi = Object.freeze({
  isOwner: () => state.isOwner,
  canEdit: () => state.isAdmin,
  can: name => name === 'data.write' ? (state.isMember || state.isAdmin)
             : name === 'assets.write' ? state.isAdmin : null,
  id: async () => (state.user ? state.user.uid : null),
  token: async () => (state.user ? state.user.getIdToken() : null),   // for the portal's own /c2/* server calls
  me: async () => ({ id: state.user && state.user.uid, name: displayNameOf(state.user) }),
  profiles: async ids => {
    const out = {};
    await Promise.all(ids.map(async id => {
      if (!(id in profileCache)) {
        try { const s = await getDoc(doc(fs, 'profiles', id)); profileCache[id] = s.exists() ? s.data() : {}; }
        catch (e) { profileCache[id] = {}; }
      }
      out[id] = { id, name: profileCache[id].name || '' };
    }));
    return out;
  },
  signOut: () => signOut(auth).then(() => location.reload()),
  email: () => (state.user && state.user.email) || ''
});
function displayNameOf(u) { return (u && (u.displayName || (u.email || '').split('@')[0])) || ''; }

/* ------------------------------------------------------------------ assets (photos) */
const assetsApi = Object.freeze({
  upload: async (blob, opts) => {
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^a-z0-9]/gi, '');
    const type = (opts && opts.type) || blob.type || 'image/jpeg';
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'jpg';
    // documents (regatta entries etc.) keep their own file name under docs/<id>/
    const safe = String((opts && opts.name) || 'file').replace(/[^\w.\- ]+/g, '_').slice(-120);
    const r = ref(storage, opts && opts.folder === 'docs' ? `docs/${id}/${safe}` : `photos/${id}.${ext}`);
    try {
      await uploadBytes(r, blob, { contentType: type, cacheControl: 'public,max-age=31536000' });
      const url = await getDownloadURL(r);
      // The app stores the returned id in its records; here the id IS the download URL.
      return { id: url, url, sizeBytes: blob.size, contentType: type };
    } catch (e) { throw mapErr(e); }
  },
  delete: async idOrUrl => {
    if (!/^https?:/.test(idOrUrl || '')) return { deleted: false };
    try { await deleteObject(ref(storage, idOrUrl)); return { deleted: true }; }
    catch (e) { if (e.code === 'storage/object-not-found') return { deleted: false }; throw mapErr(e); }
  },
  list: async () => ({ assets: [], usage: {} })
});

/* ------------------------------------------------------------------ downloads */
const downloadsApi = Object.freeze({
  save: async ({ filename, data }) => {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename || 'download';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { saved: true };
  }
});

/* ------------------------------------------------------------------ claude.use shim */
window.claude = Object.freeze({
  use: async name => {
    if (name === 'downloads') return downloadsApi;
    await ready;
    if (!state.user) return null;
    if (name === 'db') return dbApi;
    if (name === 'user') return userApi;
    if (name === 'assets') return (state.isMember || state.isAdmin) ? assetsApi : null;
    return null;
  }
});

/* ------------------------------------------------------------------ sign-in & setup UI */
const css = `
#gate{position:fixed;inset:0;z-index:200;background:#f7f6f3;display:flex;align-items:center;justify-content:center;padding:20px;font:14px/1.45 Inter,system-ui,sans-serif;color:#231f20}
#gate .card{background:#fff;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.08);padding:30px 28px;width:min(420px,100%);border-top:5px solid #ea3c42}
#gate h1{font-family:'Libre Baskerville',Georgia,serif;font-size:22px;margin:10px 0 4px}
#gate p{color:#4a4647;margin:0 0 18px}
#gate .b{display:flex;width:100%;justify-content:center;align-items:center;gap:8px;padding:11px 14px;border-radius:8px;border:1px solid #dfe3e2;background:#fff;font:inherit;font-weight:600;cursor:pointer;margin-bottom:10px}
#gate .b.pri{background:#c92c32;border-color:#c92c32;color:#fff}
#gate input{width:100%;padding:10px 12px;border:1px solid #dfe3e2;border-radius:8px;font:inherit;margin-bottom:10px;box-sizing:border-box}
#gate .or{text-align:center;color:#86888b;font-size:12px;margin:8px 0 12px}
#gate .msg{font-size:13px;margin-top:8px;color:#4a4647}#gate .err{color:#b83a2e}
#gate .logo{width:56px;height:56px}`;
function gate(html) {
  let g = document.getElementById('gate');
  if (!g) {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    g = document.createElement('div'); g.id = 'gate'; document.body.appendChild(g);
  }
  const logo = document.querySelector('.brand img');
  g.innerHTML = `<div class="card">${logo ? `<img class="logo" src="${logo.src}" alt="">` : ''}${html}</div>`;
  return g;
}
function closeGate() { const g = document.getElementById('gate'); if (g) g.remove(); }
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showSignIn(note) {
  let invited = false; try { invited = !!localStorage.getItem('vrcInvite'); } catch (e) { /* private mode */ }
  const g = gate(`<h1>VRC Rowing Portal</h1><p>${invited ? '<b>You’ve been invited!</b> Sign in with Google or your email address to finish setting up – your member profile is linked automatically.' : 'Sign in to book sessions, see the fleet and manage your profile.'}</p>
    <button class="b" id="gGoogle"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
    <div class="or">or get a sign-in link by email</div>
    <input type="email" id="gEmail" placeholder="you@example.com" autocomplete="email">
    <button class="b pri" id="gLink">Email me a sign-in link</button>
    <div class="msg ${note && note.err ? 'err' : ''}" id="gMsg">${esc(note && note.text)}</div>`);
  g.querySelector('#gGoogle').onclick = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { if (e.code !== 'auth/popup-closed-by-user') setMsg('Google sign-in didn’t complete. Please try again.', true); }
  };
  g.querySelector('#gLink').onclick = async () => {
    const email = g.querySelector('#gEmail').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg('Enter a valid email address.', true);
    try {
      await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
      try { localStorage.setItem(EMAIL_KEY, email); } catch (e) {}
      setMsg(`Check ${email} for a sign-in link. Open it on this device.`);
    } catch (e) { setMsg('Couldn’t send the link. Please check the address and try again.', true); }
  };
  function setMsg(t, err) { const m = g.querySelector('#gMsg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }
}

async function finishEmailLink() {
  if (!isSignInWithEmailLink(auth, location.href)) return;
  let email = ''; try { email = localStorage.getItem(EMAIL_KEY) || ''; } catch (e) {}
  if (!email) {
    await new Promise(res => {
      const g = gate(`<h1>Confirm your email</h1><p>For security, enter the email address this sign-in link was sent to.</p>
        <input type="email" id="gEmail2" autocomplete="email"><button class="b pri" id="gGo">Sign in</button>`);
      g.querySelector('#gGo').onclick = () => { email = g.querySelector('#gEmail2').value.trim(); res(); };
    });
  }
  try { await signInWithEmailLink(auth, email, location.href); try { localStorage.removeItem(EMAIL_KEY); } catch (e) {} }
  catch (e) { showSignIn({ text: 'That sign-in link has expired or was already used. Request a new one below.', err: true }); }
  history.replaceState(null, '', location.pathname + location.hash);
}

async function ownerSetup(user) {
  await new Promise(res => {
    const g = gate(`<h1>Set up the portal</h1><p>This portal hasn’t been set up yet. As the first person to sign in, you’ll become its <b>owner</b> – the first admin, who can add other admins and import the club’s data.</p>
      <p style="font-size:13px">Signed in as <b>${esc(user.email || displayNameOf(user))}</b>.</p>
      <button class="b pri" id="gOwn">Make me the owner</button><button class="b" id="gOut">Sign out</button><div class="msg" id="gMsg"></div>`);
    g.querySelector('#gOwn').onclick = async () => {
      try { await setDoc(doc(fs, 'config', 'settings'), { ownerUid: user.uid, ownerName: displayNameOf(user), createdAt: new Date().toISOString() }); res(); }
      catch (e) { g.querySelector('#gMsg').textContent = 'Someone else has already set up this portal. Reload to continue.'; }
    };
    g.querySelector('#gOut').onclick = () => signOut(auth).then(() => location.reload());
  });
}

async function loadAccess(user) {
  const sSnap = await getDoc(doc(fs, 'config', 'settings'));
  if (!sSnap.exists()) { await ownerSetup(user); return loadAccess(user); }
  state.settings = sSnap.data();
  state.isOwner = state.settings.ownerUid === user.uid;
  const [adm, acc] = await Promise.all([
    getDoc(doc(fs, 'admins', user.uid)).catch(() => null),
    getDoc(doc(fs, 'accounts', user.uid)).catch(() => null)
  ]);
  state.isAdmin = state.isOwner || !!(adm && adm.exists());
  state.isMember = !!(acc && acc.exists());
  state.memberId = state.isMember ? acc.data().memberId : null;
  // keep a readable name for this account so admins can recognise profile requests
  setDoc(doc(fs, 'profiles', user.uid), { name: displayNameOf(user), updatedAt: new Date().toISOString() }).catch(() => {});
}

function addAccountMenu(user) {
  const mods = document.querySelector('header .mods'); if (!mods || document.getElementById('signOut')) return;
  const b = document.createElement('button');
  b.id = 'signOut'; b.className = 'melink'; b.type = 'button'; b.title = user.email || '';
  b.textContent = 'Sign out'; b.style.background = 'none'; b.style.cursor = 'pointer';
  b.onclick = () => signOut(auth).then(() => location.reload());
  mods.appendChild(b);
}

let started = false;
finishEmailLink().finally(() => {
  onAuthStateChanged(auth, async user => {
    if (!user) { state.user = null; showSignIn(); return; }
    if (started) return; // a session change after start-up → reload for a clean state
    started = true;
    state.user = user;
    try { await loadAccess(user); }
    catch (e) { gate(`<h1>Couldn’t connect</h1><p>The portal couldn’t reach the club database. Check your connection and reload.</p>`); return; }
    closeGate(); addAccountMenu(user);
    readyResolve();
  });
});
