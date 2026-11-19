// Concept2 Logbook connection for the VRC Rowing Portal.
// One HTTPS function, reached through Firebase Hosting at /c2/* (see firebase.json):
//   /c2/callback   – Concept2 sends the member back here after they approve; we swap the code for tokens
//   /c2/webhook    – Concept2 posts here when a connected member's result is added, updated or deleted
//   /c2/sync       – the portal asks to import a member's recent results (POST, Firebase ID token)
//   /c2/disconnect – the member disconnects (POST, Firebase ID token)
// Tokens live in c2Tokens/{uid} and c2Users/{c2UserId}: the security rules let no browser read them.
// We only ever READ from Concept2 (scopes user:read,results:read).
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import nodemailer from 'nodemailer';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { mapResult, parseWebhook } from './c2map.js';
import { welcomeEmail, declinedEmail, issueEmail, smtpSettings, validEmail } from './mail.js';

initializeApp();
const db = getFirestore();
const C2 = 'https://log.concept2.com';
const SITE = 'https://vrc-rower-s-portal.web.app';
const REDIRECT = SITE + '/c2/callback';
const SCOPE = 'user:read,results:read';
const CLIENT_ID = process.env.C2_CLIENT_ID;
const CLIENT_SECRET = process.env.C2_CLIENT_SECRET;

export const c2 = onRequest({ region: 'northamerica-northeast1', maxInstances: 5, timeoutSeconds: 120 }, async (req, res) => {
  const path = req.path.replace(/^\/c2/, '') || '/';
  try {
    if (path === '/callback') return await callback(req, res);
    if (path === '/webhook') return await webhook(req, res);
    if (path === '/sync' && req.method === 'POST') return await sync(req, res);
    if (path === '/disconnect' && req.method === 'POST') return await disconnect(req, res);
    res.status(404).send('Not found');
  } catch (e) {
    console.error('c2 error', path, e && e.message);
    if (path === '/callback') return res.redirect(SITE + '/?c2=error#me');
    res.status(500).json({ error: 'Something went wrong talking to Concept2.' });
  }
});

/* ---------- Concept2 API helpers ---------- */
async function tokenRequest(params) {
  const r = await fetch(C2 + '/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: SCOPE, ...params })
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const t = await r.json();
  return { access: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + ((+t.expires_in || 3600) * 1000) };
}
async function api(path, access) {
  const r = await fetch(C2 + path, { headers: { Authorization: 'Bearer ' + access, Accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('api ' + r.status + ' ' + path);
  return r.json();
}
async function accessFor(uid) {
  const ref = db.doc('c2Tokens/' + uid), snap = await ref.get();
  if (!snap.exists) return null;
  const t = snap.data();
  if (t.expiresAt > Date.now() + 60000) return t;
  const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
  await ref.set({ ...t, ...n, refreshedAt: new Date().toISOString() });
  return { ...t, ...n };
}
async function verifyUser(req) {
  const h = req.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return (await getAuth().verifyIdToken(h.slice(7))).uid; } catch (e) { return null; }
}
async function memberFor(uid) {
  const a = await db.doc('accounts/' + uid).get();
  if (!a.exists) return null;
  const memberId = a.data().memberId;
  const m = await db.doc('members/' + memberId).get();
  return { memberId, programs: (m.exists && m.data().programs) || [] };
}

/* ---------- writing results ---------- */
async function upsertResults(uid, member, list) {
  const mapped = list.map(r => mapResult(r, { memberId: member.memberId, uid, program: member.programs[0] })).filter(Boolean);
  let added = 0;
  for (let i = 0; i < mapped.length; i += 200) {
    const chunk = mapped.slice(i, i + 200);
    const refs = chunk.map(x => db.doc('results/c2_' + x.c2Id));
    const existing = await db.getAll(...refs);
    const batch = db.batch();
    chunk.forEach((x, j) => {
      const now = new Date().toISOString();
      if (existing[j].exists) {
        const keep = existing[j].data();             // keep the member's own choices
        batch.set(refs[j], { ...x, program: keep.program || x.program, notes: keep.notes || x.notes, updatedAt: now }, { merge: true });
      } else { batch.set(refs[j], { ...x, likes: {}, at: now, updatedAt: now }); added++; }
    });
    await batch.commit();
  }
  return added;
}
async function importSince(uid, from) {
  const member = await memberFor(uid);
  const tok = await accessFor(uid);
  if (!member || !tok) return { added: 0, seen: 0 };
  let url = `/api/users/me/results?from=${from}&per_page=250`, seen = 0, added = 0, pages = 0;
  while (url && pages < 8) {
    const page = await api(url, tok.access);
    const data = (page && page.data) || [];
    seen += data.length; added += await upsertResults(uid, member, data); pages++;
    const next = page && page.meta && page.meta.pagination && page.meta.pagination.links && page.meta.pagination.links.next;
    url = next ? next.replace(C2, '') : null;
  }
  await db.doc('c2Links/' + uid).set({ lastSync: new Date().toISOString() }, { merge: true });
  return { added, seen };
}
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/* ---------- routes ---------- */
async function callback(req, res) {
  const { code, state, error } = req.query;
  if (error || !code || !state) return res.redirect(SITE + '/?c2=cancelled#me');
  const sref = db.doc('c2States/' + String(state).replace(/[^\w-]/g, '').slice(0, 64));
  const s = await sref.get();
  if (!s.exists || Date.now() - Date.parse(s.data().at) > 30 * 60000) return res.redirect(SITE + '/?c2=expired#me');
  const uid = s.data().uid;
  await sref.delete();
  if (!(await memberFor(uid))) return res.redirect(SITE + '/?c2=notlinked#me');
  const t = await tokenRequest({ grant_type: 'authorization_code', code: String(code), redirect_uri: REDIRECT });
  const me = await api('/api/users/me', t.access);
  const u = (me && me.data) || {};
  const c2UserId = String(u.id || '');
  if (!c2UserId) return res.redirect(SITE + '/?c2=error#me');
  const owner = await db.doc('c2Users/' + c2UserId).get();
  if (owner.exists && owner.data().uid !== uid) return res.redirect(SITE + '/?c2=inuse#me');
  await db.doc('c2Tokens/' + uid).set({ ...t, c2UserId, connectedAt: new Date().toISOString() });
  await db.doc('c2Users/' + c2UserId).set({ uid });
  await db.doc('c2Links/' + uid).set({ connected: true, c2UserId, c2Name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '', connectedAt: new Date().toISOString() });
  const r = await importSince(uid, daysAgo(90));
  res.redirect(SITE + `/?c2=connected&n=${r.added}#me`);
}
async function sync(req, res) {
  const uid = await verifyUser(req);
  if (!uid) return res.status(401).json({ error: 'Please sign in again.' });
  const days = Math.min(Math.max(+((req.body && req.body.days) || 365), 1), 3650);
  const r = await importSince(uid, daysAgo(days));
  res.json(r);
}
async function disconnect(req, res) {
  const uid = await verifyUser(req);
  if (!uid) return res.status(401).json({ error: 'Please sign in again.' });
  const t = await db.doc('c2Tokens/' + uid).get();
  if (t.exists && t.data().c2UserId) await db.doc('c2Users/' + t.data().c2UserId).delete();
  await db.doc('c2Tokens/' + uid).delete();
  await db.doc('c2Links/' + uid).delete();
  res.json({ ok: true });
}
// Never trust the webhook body: look the result up again with the member's own token.
async function webhook(req, res) {
  const ev = parseWebhook(req.body);
  if (!ev.id) return res.status(200).json({ ok: true, ignored: true });
  let uid = null;
  if (ev.userId) { const u = await db.doc('c2Users/' + ev.userId).get(); if (u.exists) uid = u.data().uid; }
  if (!uid) { const d = await db.doc('results/c2_' + ev.id).get(); if (d.exists) uid = d.data().by; }
  if (!uid) return res.status(200).json({ ok: true, ignored: true });
  const tok = await accessFor(uid);
  if (!tok) return res.status(200).json({ ok: true, ignored: true });
  const got = await api(`/api/users/me/results/${encodeURIComponent(ev.id)}`, tok.access);
  if (!got || !got.data) { await db.doc('results/c2_' + ev.id).delete().catch(() => {}); return res.json({ ok: true, deleted: true }); }
  const member = await memberFor(uid);
  if (member) await upsertResults(uid, member, [got.data]);
  res.json({ ok: true });
}

/* =================== member emails =================== */
// Welcome email when an admin approves a profile request (accounts/{uid} is created),
// and a short note when a request is declined (claims/{uid}.status → rejected).
// mailLog/{key} makes each email go out once, even if a trigger fires twice.
const REGION = 'northamerica-northeast1';
async function memberEmail(uid, claim) {
  try { const u = await getAuth().getUser(uid); if (validEmail(u.email)) return u.email; } catch (e) { /* deleted user */ }
  const p = await db.doc('memberPrivate/' + uid).get();
  if (p.exists && validEmail(p.data().email)) return p.data().email;
  return claim && validEmail(claim.email) ? claim.email : null;
}
async function sendOnce(key, to, msg) {
  const cfg = smtpSettings();
  if (!cfg) { console.warn('mail: SMTP not configured – skipped', key); return; }
  const ref = db.doc('mailLog/' + key);
  const toLabel = typeof to === 'string' ? to : `${to.bcc.length} admin${to.bcc.length === 1 ? '' : 's'}`;
  try { await ref.create({ to: toLabel, subject: msg.subject, at: new Date().toISOString(), status: 'sending' }); }
  catch (e) { console.log('mail: already sent', key); return; }
  try {
    const t = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.auth });
    const rcpt = typeof to === 'string' ? { to } : { to: cfg.from, bcc: to.bcc };
    const info = await t.sendMail({ from: cfg.from, ...rcpt, subject: msg.subject, text: msg.text, html: msg.html });
    await ref.update({ status: 'sent', messageId: info.messageId || null });
  } catch (e) {
    console.error('mail: send failed', key, e && e.message);
    await ref.update({ status: 'failed', error: String(e && e.message || e).slice(0, 300) });
  }
}
export const emailOnApproval = onDocumentCreated({ document: 'accounts/{uid}', region: REGION }, async (event) => {
  const uid = event.params.uid, acct = event.data && event.data.data();
  if (!acct || !acct.memberId) return;
  const [m, c] = await Promise.all([db.doc('members/' + acct.memberId).get(), db.doc('claims/' + uid).get()]);
  const member = m.exists ? m.data() : {}, claim = c.exists ? c.data() : {};
  const to = await memberEmail(uid, claim);
  if (!to) return console.warn('mail: no email for', uid);
  const firstName = claim.firstName || (member.firstName) || (member.displayName || '').split(' ')[0];
  await sendOnce(`welcome_${uid}_${acct.memberId}`, to, welcomeEmail({ firstName, memberName: member.displayName, programs: member.programs || [] }));
});
export const emailOnDecline = onDocumentUpdated({ document: 'claims/{uid}', region: REGION }, async (event) => {
  const before = event.data.before.data() || {}, after = event.data.after.data() || {};
  if (after.status !== 'rejected' || before.status === 'rejected') return;
  const uid = event.params.uid;
  const to = await memberEmail(uid, after);
  if (!to) return;
  const p = await db.doc('profiles/' + uid).get();
  const firstName = after.firstName || ((p.exists && p.data().name) || '').split(' ')[0];
  await sendOnce(`declined_${uid}_${(after.reviewedAt || '').replace(/\W/g, '')}`, to, declinedEmail({ firstName, reason: after.reason }));
});

// Email every admin (and the owner) when a member reports damage on a boat.
async function adminEmails() {
  const uids = new Set((await db.collection('admins').get()).docs.map(d => d.id));
  const settings = await db.doc('config/settings').get();
  if (settings.exists && settings.data().ownerUid) uids.add(settings.data().ownerUid);
  const out = new Set();
  for (const uid of uids) {
    const pref = await db.doc('memberPrefs/' + uid).get();
    if (pref.exists && pref.data().issueEmails === false) continue;   // admin opted out
    const e = await memberEmail(uid, null); if (e) out.add(e.toLowerCase());
  }
  return [...out];
}
export const emailAdminsOnIssue = onDocumentCreated({ document: 'issues/{id}', region: REGION }, async (event) => {
  const id = event.params.id, it = event.data && event.data.data();
  if (!it) return;
  const [boat, acct] = await Promise.all([db.doc('boats/' + it.boatId).get(), it.by ? db.doc('accounts/' + it.by).get() : null]);
  let reporter = '';
  if (acct && acct.exists) { const m = await db.doc('members/' + acct.data().memberId).get(); reporter = m.exists ? m.data().displayName : ''; }
  const to = await adminEmails();
  if (!to.length) return console.warn('mail: no admin emails for issue', id);
  const msg = issueEmail({ boatName: boat.exists ? boat.data().name : it.boatId, severity: it.severity, location: it.location, description: it.description, reporter, photos: it.photos || [], at: it.at });
  // one email, admins in BCC so addresses stay private
  await sendOnce('issue_' + id, { bcc: to }, msg);
});
