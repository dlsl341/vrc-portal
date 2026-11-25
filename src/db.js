// Firebase data + auth layer for the ICG Retail Operations Portal.
//
// The portal UI (app.js) keeps everything in one in-memory state object `S`
// and calls save() after every change. This module:
//   • signs people in (Microsoft 365, Google, one-time email link)
//   • handles self sign-up → "waiting for approval" → Admin approves
//   • loads each collection from Firestore into S and keeps it live
//   • on save(), writes only the documents that actually changed
//   • stores attachments in Cloud Storage
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult,
  OAuthProvider, GoogleAuthProvider, sendSignInLinkToEmail, isSignInWithEmailLink,
  signInWithEmailLink, signOut, connectAuthEmulator
} from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, onSnapshot, query, orderBy, limit, where, arrayUnion, deleteField, FieldPath
} from "firebase/firestore";
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBlob, getDownloadURL, deleteObject } from "firebase/storage";
import { firebaseConfig, BOOTSTRAP_SUPER_ADMINS, MS_TENANT, USE_EMULATORS } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = getFirestore(app);
let storage = null;
try { storage = getStorage(app); } catch (e) { storage = null; }
if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(fs, "127.0.0.1", 8080);
  if (storage) connectStorageEmulator(storage, "127.0.0.1", 9199);
}

const LVL = { super: 5, admin: 4, ho: 3, dm: 3, sm: 2, store: 1 };
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── What gets synced ────────────────────────────────────────────────────────
// key: Firestore document id for an item. omit: fields worked out on load, never stored.
const COLS = {
  users:   { key: u => String(u.email || "").toLowerCase(), omit: ["prov", "last", "lastDays"], sort: (a, b) => String(a.name).localeCompare(String(b.name)) },
  brands:  { key: x => x.id, ordered: true },
  links:   { key: x => x.id, ordered: true },
  pc:      { key: x => x.id, ordered: true },
  forms:   { key: x => x.id, ordered: true },
  growProjects: { key: x => x.id, grow: true, sort: (a, b) => String(a.anchor || "9").localeCompare(String(b.anchor || "9")) },
  growTasks: { key: x => x.id, grow: true },
  feedback:{ key: x => x.id, sort: (a, b) => String(b.created || "").localeCompare(String(a.created || "")) },
  pcsubs:  { key: x => x.id, sort: (a, b) => String(b.created || "").localeCompare(String(a.created || "")) },
  leadprog:{ key: x => x.id },
  training:{ key: x => x.id, sort: (a, b) => String(b.updated || b.created || "").localeCompare(String(a.updated || a.created || "")) },
  fleet:   { key: x => x.fid, sort: (a, b) => (+a.no || 0) - (+b.no || 0) },
  posts:   { key: x => x.id, sort: (a, b) => String(b.date || "").localeCompare(String(a.date || "")) },
  events:  { key: x => x.id, sort: (a, b) => String(a.date || "").localeCompare(String(b.date || "")) },
  tickets: { key: x => x.id, sort: (a, b) => String(b.created || "").localeCompare(String(a.created || "")) },
  trips:   { key: x => x.id, sort: (a, b) => String(b.created || "").localeCompare(String(a.created || "")) },
  travelers: { key: x => x.uid },
  highfives: { key: x => x.id, sort: (a, b) => String(b.date || "").localeCompare(String(a.date || "")) },
  hfdraws: { key: x => x.id, perm: "hf" },
  sops:    { key: x => x.id, sort: (a, b) => String(a.no || "").localeCompare(String(b.no || "")) },
  audit:   { key: x => x.id, noDelete: true, perm: "audit", q: c => query(c, orderBy("ts", "desc"), limit(400)), sort: (a, b) => (b.ts || 0) - (a.ts || 0) }
};
const SINGLE = { security: "config/security", sd: "config/sd", perms: "config/perms" };

// ── State ───────────────────────────────────────────────────────────────────
const S = { leadprog: [], training: [], feedback: [], growProjects: [], growTasks: [], forms: [], pcsubs: [], pc: [], highfives: [], hfdraws: [], sops: [], trips: [], travelers: [], users: [], brands: [], links: [], fleet: [], posts: [], events: [], tickets: [], audit: [], favs: {}, security: {}, perms: {}, sd: { depts: [], cats: [], sla: {}, seq: 0 }, session: null, view: "home" };
const vault = {};            // store no → confidential values (admins only)
const base = new Map();      // doc path → JSON last known to match the server
const canDo = k => !!profile && (profile.role === "super" || ((hooks.permsOf && hooks.permsOf(profile.role)) || []).includes(k));
let profile = null, myLvl = 0, unsubs = [], hooks = {}, refreshTimer = null, flushing = null, dirty = false, denyToastAt = 0;

const clean = (item, spec) => {
  const o = JSON.parse(JSON.stringify(item ?? {}));
  (spec && spec.omit || []).forEach(k => delete o[k]);
  return o;
};
const stable = o => JSON.stringify(o, Object.keys(flatKeys(o)).sort());
function flatKeys(o, acc = {}) { if (o && typeof o === "object") for (const k in o) { acc[k] = 1; flatKeys(o[k], acc); } return acc; }

function relLast(ts) {
  if (!ts) return { last: "Never", lastDays: null };
  const d = new Date(ts), now = new Date();
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  const t = d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
  return { last: days <= 0 ? "Today " + t : days === 1 ? "Yesterday" : d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }), lastDays: days };
}
function derive(name, item) { if (name === "users") Object.assign(item, relLast(item.lastAt)); }

function sortCol(name) {
  const spec = COLS[name];
  if (spec.ordered) S[name].sort((a, b) => (a._o ?? 0) - (b._o ?? 0));
  else if (spec.sort) S[name].sort(spec.sort);
}

// Merge server data into an existing object in place, so open screens that hold
// a reference to it keep working.
function mergeInto(target, data, omit = []) {
  for (const k of Object.keys(target)) if (!(k in data) && !omit.includes(k)) delete target[k];
  Object.assign(target, data);
  return target;
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest("#view")) { scheduleRefresh(); return; }
    hooks.refresh && hooks.refresh();
  }, 400);
}

// ── Live listeners ──────────────────────────────────────────────────────────
// A collection can be loaded through several queries (e.g. one per store). `members` tracks which
// queries currently include each document, so a document is only dropped when no query has it.
const members = {};
function listenCol(name, q, tag) {
  const spec = COLS[name];
  const c = collection(fs, name);
  tag = tag || "all";
  const mem = members[name] = members[name] || new Map();
  return new Promise(resolve => {
    let first = true;
    const un = onSnapshot(q || (spec.q ? spec.q(c) : c), snap => {
      let changed = false;
      snap.docChanges().forEach(ch => {
        const path = name + "/" + ch.doc.id;
        const data = ch.doc.data();
        const arr = S[name];
        const idx = arr.findIndex(x => spec.key(x) === ch.doc.id);
        if (ch.type === "removed") {
          if (spec.noDelete) return;
          const set = mem.get(ch.doc.id); if (set) { set.delete(tag); if (set.size) return; mem.delete(ch.doc.id); }
          base.delete(path);
          if (idx >= 0) { arr.splice(idx, 1); changed = true; }
          return;
        }
        if (!mem.has(ch.doc.id)) mem.set(ch.doc.id, new Set());
        mem.get(ch.doc.id).add(tag);
        const j = stable(data);
        if (base.get(path) === j && idx >= 0) return;   // echo of our own write
        base.set(path, j);
        if (idx >= 0) mergeInto(arr[idx], data, spec.omit); else arr.push(data);
        derive(name, idx >= 0 ? arr[idx] : data);
        changed = true;
      });
      if (changed) sortCol(name);
      if (first) { first = false; resolve(); } else if (changed) scheduleRefresh();
    }, err => { console.warn("listen " + name, err.code); if (first) { first = false; resolve(); } });
    unsubs.push(un);
  });
}

function listenDoc(key, path) {
  return new Promise(resolve => {
    let first = true;
    const un = onSnapshot(doc(fs, path), snap => {
      const data = snap.exists() ? snap.data() : null;
      let changed = false;
      if (data) {
        const j = stable(data);
        if (base.get(path) !== j) { base.set(path, j); mergeInto(S[key], data); changed = true; }
      }
      if (first) { first = false; resolve(); } else if (changed) scheduleRefresh();
    }, err => { console.warn("listen " + path, err.code); if (first) { first = false; resolve(); } });
    unsubs.push(un);
  });
}

function listenFavs() {
  const path = "favs/" + profile.id;
  return new Promise(resolve => {
    let first = true;
    unsubs.push(onSnapshot(doc(fs, path), snap => {
      if (snap.exists()) {
        const list = snap.data().list || [];
        const seen = snap.data().seen || {};
        const j = stable({ list, seen });
        if (base.get(path) !== j) { base.set(path, j); S.favs[profile.id] = S.favs[profile.id] || []; S.favs[profile.id].splice(0, Infinity, ...list); S.seen = Object.assign({}, seen); if (!first) scheduleRefresh(); }
      }
      if (first) { first = false; resolve(); }
    }, () => { if (first) { first = false; resolve(); } }));
  });
}

function listenVault() {
  return new Promise(resolve => {
    let first = true;
    unsubs.push(onSnapshot(collection(fs, "vault"), snap => {
      snap.docChanges().forEach(ch => {
        const path = "vault/" + ch.doc.id;
        if (ch.type === "removed") { base.delete(path); delete vault[ch.doc.id]; return; }
        const data = ch.doc.data(); const j = stable(data);
        if (base.get(path) === j) return;
        base.set(path, j); vault[ch.doc.id] = mergeInto(vault[ch.doc.id] || {}, data);
      });
      if (first) { first = false; resolve(); }
    }, () => { if (first) { first = false; resolve(); } }));
  });
}

async function loadAll() {
  unsubs.forEach(u => u()); unsubs = [];
  // Permissions first: they decide which restricted collections this person can load.
  await listenDoc("perms", SINGLE.perms);
  const jobs = [];
  for (const name of Object.keys(COLS)) {
    if (COLS[name].perm && !canDo(COLS[name].perm)) continue;
    if (COLS[name].grow && !(profile.role === "super" || profile.grow || profile.leadDept || (profile.leadDepts || []).length)) continue;
    // Travel: the travel desk loads everything; everyone else only their own trips/profile.
    if (name === "trips" && !profile.travelDesk) { [["travelerId", "t"], ["approverId", "a"], ["createdBy", "c"]].forEach(([f, tag]) =>
        jobs.push(listenCol("trips", query(collection(fs, "trips"), where(f, "==", profile.id)), tag))); continue; }
    // P&C form submissions: the P&C team loads everything; others what they submitted or must approve.
    if (name === "feedback" && profile.role !== "super") { jobs.push(listenCol("feedback", query(collection(fs, "feedback"), where("by", "==", profile.id)), "m")); continue; }
    if (name === "pcsubs" && !(profile.role === "super" || profile.role === "pcadmin" || profile.pcTeam)) { [["by", "b"], ["approverId", "a"]].forEach(([f, tag]) =>
        jobs.push(listenCol("pcsubs", query(collection(fs, "pcsubs"), where(f, "==", profile.id)), tag))); continue; }
    // High Fives: admins load everything; everyone else the ones they sent or received.
    if (name === "highfives" && !canDo("hf")) { jobs.push(listenCol("highfives", query(collection(fs, "highfives"), where("by", "==", profile.id)), "by"));
      if (profile.email) jobs.push(listenCol("highfives", query(collection(fs, "highfives"), where("toEmail", "==", String(profile.email).toLowerCase())), "to")); continue; }
    if (name === "travelers" && !profile.travelDesk && profile.role !== "pcadmin") { jobs.push(listenCol("travelers", query(collection(fs, "travelers"), where("uid", "==", profile.id)), "me")); continue; }
    if (name === "tickets" && !seesAllTickets()) { ticketStores().forEach(st => jobs.push(listenCol("tickets", query(collection(fs, "tickets"), where("store", "==", st)), "s:" + st)));
      jobs.push(listenCol("tickets", query(collection(fs, "tickets"), where("requester", "==", profile.id)), "mine")); continue; }
    // Training records: Super/Admin/Support Centre/P&C load all; DMs their stores, Store Managers their store;
    // everyone the records they made or that are about them.
    if (name === "training" && !seesAllTraining()) { if (myLvl >= 2) ticketStores().forEach(st => jobs.push(listenCol("training", query(collection(fs, "training"), where("store", "==", st)), "s:" + st)));
      [["by", "b"], ["empId", "e"]].forEach(([f, tag]) => jobs.push(listenCol("training", query(collection(fs, "training"), where(f, "==", profile.id)), tag))); continue; }
    // Leadership Academy checklists: DMs, Support Centre and up, and P&C see everyone's; others their own.
    if (name === "leadprog" && !(myLvl >= 3 || profile.role === "pcadmin" || profile.pcTeam)) { jobs.push(listenCol("leadprog", query(collection(fs, "leadprog"), where("uid", "==", profile.id)), "me")); continue; }
    jobs.push(listenCol(name));
  }
  for (const [k, p] of Object.entries(SINGLE)) if (k !== "perms") jobs.push(listenDoc(k, p));
  jobs.push(listenFavs());
  if (canDo("vault")) jobs.push(listenVault());
  await Promise.all(jobs);
}

// Service requests are restricted by the database: Super Admin, Admin and Head Office read every
// store; District Managers the stores in their district (users/{email}.dmStores, kept up to date from
// Fleet → Districts); everyone else their own store. Anyone can also read requests they opened.
const seesAllTickets = () => !!profile && ["super", "admin", "ho", "pcadmin"].includes(profile.role);
const seesAllTraining = () => !!profile && (["super", "admin", "ho", "pcadmin"].includes(profile.role) || !!profile.pcTeam);
const ticketStores = () => profile.role === "dm" ? (profile.dmStores || []) : (profile.store ? [profile.store] : []);

const myEmail = () => String((auth.currentUser && auth.currentUser.email) || "").toLowerCase();

// ── Saving: write only what changed ─────────────────────────────────────────
function desiredDocs() {
  const out = new Map();
  for (const [name, spec] of Object.entries(COLS)) {
    if (spec.perm && !canDo(spec.perm) && name !== "audit") continue;
    if (spec.grow && !(profile && (profile.role === "super" || profile.grow || profile.leadDept || (profile.leadDepts || []).length))) continue;
    S[name].forEach((item, i) => {
      if (spec.ordered && item._o == null) item._o = Date.now() + i;
      if (name === "fleet" && !item.fid) item.fid = rid("f");
      if (name === "audit") { if (!item.id) item.id = rid("a"); if (!item.ts) { item.ts = Date.now(); item.by = myEmail(); } }
      const k = spec.key(item);
      if (!k) return;
      const data = clean(item, spec);
      if (name === "users" && data.email) data.email = String(data.email).toLowerCase();
      if (name === "users" && canDo("users") && S.fleet.length) {
        if (data.role === "dm") data.dmStores = S.fleet.filter(f => f.dm === data.id).map(f => f.name).sort();
        else delete data.dmStores;
        item.dmStores = data.dmStores;
      }
      out.set(name + "/" + k, { name, data });
    });
  }
  for (const [key, path] of Object.entries(SINGLE)) {
    if (key === "perms" && (!profile || profile.role !== "super")) continue;
    if (key === "perms" && !Object.keys(S.perms || {}).length) continue;
    const d = clean(S[key]);
    if (key === "security") d.allowedDomains = allowedDomains();
    out.set(path, { name: key, data: d });
  }
  if (profile && (S.favs[profile.id] || S.seen)) out.set("favs/" + profile.id, { name: "favs", data: { list: (S.favs[profile.id] || []).slice(), seen: Object.assign({}, S.seen || {}) } });
  if (canDo("vault")) for (const [no, v] of Object.entries(vault)) out.set("vault/" + no, { name: "vault", data: clean(v) });
  return out;
}

function allowedDomains() {
  const list = String(S.security.domains || "").split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  S.brands.forEach(b => (b.domains || []).forEach(d => list.push(String(d).toLowerCase())));
  return [...new Set(list)];
}

async function flush() {
  dirty = false;
  const want = desiredDocs();
  const writes = [];
  for (const [path, { data }] of want) {
    const j = stable(data);
    const prevJ = base.get(path);
    if (prevJ === j) continue;
    base.set(path, j);
    const upd = prevJ ? fieldUpdates(JSON.parse(prevJ), data) : null;
    writes.push((upd ? updateDoc(doc(fs, path), ...upd).catch(e => e && e.code === "not-found" ? setDoc(doc(fs, path), data) : Promise.reject(e)) : setDoc(doc(fs, path), data)).catch(e => fail(path, e)));
  }
  for (const path of [...base.keys()]) {
    if (want.has(path)) continue;
    const col = path.split("/")[0];
    if (col === "config" || col === "favs" || (COLS[col] && COLS[col].noDelete)) continue;
    if (COLS[col] && COLS[col].perm && !canDo(COLS[col].perm)) continue;
    if (col === "vault" && !canDo("vault")) continue;
    base.delete(path);
    writes.push(deleteDoc(doc(fs, path)).catch(e => fail(path, e)));
  }
  await Promise.all(writes);
}
// Write only what changed, so two people editing the same record at once don't overwrite each other
// (e.g. many stores acknowledging the same post, or task progress from several stores). Lists that only
// grew (acknowledgements, logs) are merged with arrayUnion; maps are updated key by key.
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
function fieldUpdates(prev, next) {
  const out = [];
  const keys = new Set(Object.keys(prev).concat(Object.keys(next)));
  for (const k of keys) {
    const a = prev[k], b = next[k];
    if (stable(a) === stable(b)) continue;
    if (b === undefined) { out.push(new FieldPath(k), deleteField()); continue; }
    if (Array.isArray(a) && Array.isArray(b) && b.length > a.length && a.every((x, i) => stable(x) === stable(b[i]))) {
      out.push(new FieldPath(k), arrayUnion(...b.slice(a.length))); continue;
    }
    if (isObj(a) && isObj(b)) {
      for (const s of new Set(Object.keys(a).concat(Object.keys(b)))) {
        if (stable(a[s]) === stable(b[s])) continue;
        out.push(new FieldPath(k, s), b[s] === undefined ? deleteField() : b[s]);
      }
      continue;
    }
    out.push(new FieldPath(k), b);
  }
  return out.length ? out : null;
}
function fail(path, e) {
  console.warn("Save failed:", path, e && e.code);
  base.delete(path);
  if (Date.now() - denyToastAt > 4000) {
    denyToastAt = Date.now();
    hooks.toast && hooks.toast(e && e.code === "permission-denied" ? "That change wasn't saved: your role doesn't allow it." : "Couldn't save. Check your connection and try again.");
  }
}

function save() {
  if (!profile) return;
  dirty = true;
  if (flushing) return;
  flushing = Promise.resolve().then(async () => { while (dirty) await flush(); }).finally(() => { flushing = null; });
}

// ── Sign-in ─────────────────────────────────────────────────────────────────
const methodLabel = u => {
  const p = (u.providerData[0] || {}).providerId || "";
  return p === "microsoft.com" ? "Microsoft 365" : p === "google.com" ? "Google" : "Email link";
};
function authError(e) {
  const c = e && e.code || "";
  if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return null;
  if (c === "auth/account-exists-with-different-credential") return "This email already signs in with a different method. Use the button you used last time (Microsoft 365, Google or email link).";
  if (c === "auth/unauthorized-domain") return "This web address isn't authorised for sign-in yet. Add it under Firebase → Authentication → Settings → Authorised domains.";
  if (c === "auth/operation-not-allowed") return "That sign-in method isn't switched on in Firebase yet.";
  return "Sign-in didn't work (" + (c || "unknown error") + "). Please try again.";
}
async function popup(provider) {
  try { localStorage.removeItem("icg-last-active"); } catch (e) { /* private mode */ }
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return signInWithRedirect(auth, provider);
    const m = authError(e); if (m) hooks.toast && hooks.toast(m);
  }
}
function signInMicrosoft() {
  const p = new OAuthProvider("microsoft.com");
  p.setCustomParameters({ prompt: "select_account", tenant: MS_TENANT });
  return popup(p);
}
function signInGoogle() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return popup(p);
}
async function sendEmailLink(email) {
  await sendSignInLinkToEmail(auth, email, { url: location.origin + "/", handleCodeInApp: true });
  try { localStorage.setItem("icgEmailForSignIn", email); } catch (e) {}
}
async function completeEmailLink() {
  if (!isSignInWithEmailLink(auth, location.href)) return;
  let email = null;
  try { email = localStorage.getItem("icgEmailForSignIn"); } catch (e) {}
  if (!email) email = window.prompt("To finish signing in, confirm your work email:");
  if (!email) return;
  try { localStorage.removeItem("icg-last-active"); } catch (e) { /* private mode */ }
  try { await signInWithEmailLink(auth, email.trim(), location.href); }
  catch (e) { hooks.toast && hooks.toast("That sign-in link has expired or was already used. Request a new one."); }
  try { localStorage.removeItem("icgEmailForSignIn"); } catch (e) {}
  history.replaceState(null, "", location.pathname + location.hash);
}

async function requestAccess({ name, title, reqStore }) {
  const u = auth.currentUser; if (!u) return;
  const email = u.email.toLowerCase();
  const data = { id: rid("u"), name, title, email, brand: "auto", role: "store", store: "", reqStore, status: "pending", auth: methodLabel(u), requestedAt: new Date().toISOString() };
  try { await setDoc(doc(fs, "users", email), data); hooks.access({ kind: "pending", name, email }); }
  catch (e) { hooks.access({ kind: "domain", email }); }
}

async function doSignOut() {
  try { if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {}); } catch (e) { /* unsupported */ }
  try { localStorage.removeItem("icg-last-active"); } catch (e) { /* private mode */ }
  unsubs.forEach(u => u()); unsubs = [];
  await signOut(auth);
  location.hash = ""; location.reload();
}

// First Super Admin sign-in on a brand-new project: create the profile and load starter data.
async function bootstrap(user, email) {
  const data = { id: rid("u"), name: user.displayName || email.split("@")[0], title: "", email, brand: "group", role: "super", store: "Head Office – Yaletown", status: "active", auth: methodLabel(user), lastAt: new Date().toISOString() };
  await setDoc(doc(fs, "users", email), data);
  const meta = await getDoc(doc(fs, "config/meta"));
  if (!meta.exists() || !meta.data().seeded) {
    const st = hooks.starter();
    const jobs = [];
    st.brands.forEach((b, i) => { b._o = i; jobs.push(setDoc(doc(fs, "brands", b.id), clean(b))); });
    st.links.forEach((l, i) => { l._o = i; jobs.push(setDoc(doc(fs, "links", l.id), clean(l))); });
    st.fleet.forEach(f => { f.fid = f.fid || rid("f"); jobs.push(setDoc(doc(fs, "fleet", f.fid), clean(f))); });
    S.brands = st.brands; S.security = st.security;
    jobs.push(setDoc(doc(fs, "config/sd"), clean(st.sd)));
    jobs.push(setDoc(doc(fs, "config/security"), Object.assign(clean(st.security), { allowedDomains: allowedDomains() })));
    await Promise.all(jobs);
    await setDoc(doc(fs, "config/meta"), { seeded: true, at: new Date().toISOString(), by: email });
  }
  return data;
}

async function onUser(user) {
  if (!user) { profile = null; hooks.login(); return; }
  const email = String(user.email || "").toLowerCase();
  if (!email) { hooks.access({ kind: "error", msg: "Your account didn't share an email address, so the portal can't match it to a profile." }); return; }
  hooks.access({ kind: "loading" });
  let snap;
  try { snap = await getDoc(doc(fs, "users", email)); }
  catch (e) { hooks.access({ kind: "error", msg: "Couldn't reach the portal database (" + (e.code || e.message) + ")." }); return; }
  let p = snap.exists() ? snap.data() : null;
  if (!p && BOOTSTRAP_SUPER_ADMINS.map(x => x.toLowerCase()).includes(email)) {
    try { p = await bootstrap(user, email); }
    catch (e) { hooks.access({ kind: "error", msg: "First-time setup failed (" + (e.code || e.message) + "). Check that firestore.rules is deployed and lists your email." }); return; }
  }
  if (!p) { hooks.access({ kind: "request", name: user.displayName || "", email }); return; }
  if (p.status === "pending") { hooks.access({ kind: "pending", name: p.name, email }); return; }
  if (p.status === "inactive") { hooks.access({ kind: "inactive", name: p.name, email }); return; }

  // Signed in and allowed. Record sign-in, then load everything.
  const upd = Object.assign({}, p, { lastAt: new Date().toISOString(), auth: methodLabel(user) });
  if (p.status === "invited") upd.status = "active";
  try { await setDoc(doc(fs, "users", email), upd); } catch (e) { console.warn("profile update", e.code); }
  profile = upd; myLvl = LVL[upd.role] || 1;
  await loadAll();
  if (!S.users.some(u => u.id === profile.id)) S.users.push(Object.assign({}, profile, relLast(profile.lastAt)));
  S.session = profile.id;
  try { if (!localStorage.getItem("icg-last-active")) localStorage.setItem("icg-last-active", String(Date.now())); } catch (e) { /* private mode */ }
  S.audit.unshift({ id: rid("a"), ts: Date.now(), by: myEmail(), t: new Date().toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), w: profile.name, a: "Signed in with " + upd.auth });
  hooks.enter();
  save();
}

// Public bits the login screen needs before anyone signs in.
async function loadPublic() {
  try {
    const [b, sec] = await Promise.all([getDocs(collection(fs, "brands")), getDoc(doc(fs, "config/security"))]);
    const list = b.docs.map(d => d.data()).sort((x, y) => (x._o ?? 0) - (y._o ?? 0));
    if (list.length) S.brands = list;
    if (sec.exists()) S.security = sec.data();
  } catch (e) { console.warn("public load", e.code); }
}

async function start(h) {
  hooks = h;
  if (!S.brands.length) S.brands = hooks.starter().brands;
  if (!S.security.domains) S.security = hooks.starter().security;
  await loadPublic();
  hooks.login();
  try { await getRedirectResult(auth); } catch (e) { const m = authError(e); if (m) hooks.toast(m); }
  await completeEmailLink();
  onAuthStateChanged(auth, u => { onUser(u).catch(e => { console.error(e); hooks.access({ kind: "error", msg: e.message }); }); });
}

// ── Attachments (Cloud Storage) ─────────────────────────────────────────────
// Files live under attachments/{id} (Grind posts, task photos) or sr/{requestId}/{id} (service
// requests, so storage.rules can check the request's store). A value with a "/" is a full path.
const filePath = p => String(p).includes("/") ? String(p) : "attachments/" + p;
// Outgoing email goes into the "mail" collection in the format of Firebase's "Trigger Email"
// extension, which sends it. Until a sender is connected, messages simply wait in the queue.
async function queueMail({ to, subject, text, ref, anon, slack, slackOnly }) {
  try { await setDoc(doc(fs, "mail", rid("m")), { to, message: { subject, text }, meta: { ref: ref || "", by: anon || !profile ? "" : profile.email, slack: slack || "", slackOnly: !!slackOnly }, createdAt: new Date().toISOString() }); }
  catch (e) { console.warn("mail queue", e.code); }
}
async function mailRecent() {
  const snap = await getDocs(query(collection(fs, "mail"), orderBy("createdAt", "desc"), limit(60)));
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
}
// Profile photos: avatars/{email}/{fileId}. Returns a long-lived download URL saved on the profile.
async function avatarPut(email, blob) {
  if (!storage) throw new Error("Cloud Storage isn't set up for this project.");
  const r = ref(storage, "avatars/" + String(email).toLowerCase() + "/" + rid("p") + ".jpg");
  await uploadBytes(r, blob, { contentType: "image/jpeg" });
  return getDownloadURL(r);
}
async function filePut(id, file, folder) {
  if (!storage) throw new Error("Cloud Storage isn't set up for this project.");
  await uploadBytes(ref(storage, (folder || "attachments") + "/" + id), file, { contentType: file.type || "application/octet-stream", customMetadata: { name: file.name || id } });
}
async function fileGet(id) {
  if (!storage) return null;
  try { return await getBlob(ref(storage, filePath(id))); } catch (e) { console.warn("file get", e.code); return null; }
}
// A signed link to the file. Opening it in a tab works without bucket CORS settings (unlike getBlob).
async function fileUrl(id) {
  if (!storage) return null;
  try { return await getDownloadURL(ref(storage, filePath(id))); } catch (e) { console.warn("file url", e.code); return null; }
}
async function fileDel(id) {
  if (!storage) return;
  try { await deleteObject(ref(storage, filePath(id))); } catch (e) { /* already gone */ }
}

// Brand scan: ask the server (functions/index.js → brandScan) to read a brand's website and return
// its name, logo, colours and fonts. Resolves with the result, or rejects with a readable message.
function brandScan(url) {
  return new Promise((resolve, reject) => {
    const id = rid("bs"); const r = doc(fs, "brandScans", id); let un = () => {}; let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); un(); fn(v); };
    const timer = setTimeout(() => finish(reject, new Error("The website didn't answer in time, or the brand scanner isn't deployed yet (see SETUP.md → Brand scan).")), 60000);
    setDoc(r, { url: String(url).trim(), by: profile ? profile.id : "", status: "pending", createdAt: new Date().toISOString() })
      .then(() => {
        un = onSnapshot(r, snap => {
          const d = snap.exists() ? snap.data() : null; if (!d) return;
          if (d.status === "done") finish(resolve, d.result || {});
          else if (d.status === "error") finish(reject, new Error(d.error || "The scan failed."));
        }, e => finish(reject, e));
      })
      .catch(e => finish(reject, new Error(e && e.code === "permission-denied" ? "You don't have permission to add brands." : (e.message || String(e)))));
  });
}

// Slack bot token (Admin → Sign-in & security → Slack). Write-only: the database never lets anyone
// read it back; only the server's sendMail function uses it.
async function setSlackToken(token) { await setDoc(doc(fs, "config/slackSecret"), { token: String(token || "").trim(), at: new Date().toISOString(), by: profile ? profile.email : "" }); }
// Personal calendar feed: calfeeds/{token} {uid,email,created}. The token is the secret part of the
// feed address (functions/index.js → calFeed). One per person; "reset" makes a new one.
const CAL_REGION = "northamerica-northeast2";
async function calFeed(reset) {
  if (!profile) throw new Error("Not signed in");
  const mine = await getDocs(query(collection(fs, "calfeeds"), where("uid", "==", profile.id)));
  if (!reset && mine.docs.length) return { token: mine.docs[0].id, url: calFeedUrl(mine.docs[0].id) };
  await Promise.all(mine.docs.map(d => deleteDoc(doc(fs, "calfeeds", d.id)).catch(() => {})));
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  const token = Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
  await setDoc(doc(fs, "calfeeds", token), { uid: profile.id, email: String(profile.email || "").toLowerCase(), created: new Date().toISOString() });
  return { token, url: calFeedUrl(token) };
}
const calFeedUrl = t => `https://${CAL_REGION}-${firebaseConfig.projectId}.cloudfunctions.net/calFeed?t=${t}`;

export const DB = {
  state: S, vault, save, start, signInMicrosoft, signInGoogle, sendEmailLink, requestAccess,
  signOut: doSignOut, avatarPut, filePut, fileGet, fileUrl, fileDel, queueMail, mailRecent, brandScan, calFeed, setSlackToken,
  get profile() { return profile; }
};
