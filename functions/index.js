// Concept2 Logbook connection for the VRC Rowing Portal.
// One HTTPS function, reached through Firebase Hosting at /c2/* (see firebase.json):
//   /c2/callback   – Concept2 sends the member back here after they approve; we swap the code for tokens
//   /c2/webhook    – Concept2 posts here when a connected member's result is added, updated or deleted
//   /c2/sync       – the portal asks to import a member's recent results (POST, Firebase ID token)
//   /c2/disconnect – the member disconnects (POST, Firebase ID token)
// Tokens live in c2Tokens/{uid} and c2Users/{c2UserId}: the security rules let no browser read them.
// We only ever READ from Concept2 (scopes user:read,results:read).
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten, onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import nodemailer from 'nodemailer';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { mapResult, parseWebhook } from './c2map.js';
import { welcomeEmail, declinedEmail, issueEmail, cancelEmail, claimAdminEmail, waitlistEmail, feeEmail, feeWaivedEmail, feeReportEmail, inviteEmail, boatAwayEmail, shiftEmail, deadlineEmail, shiftReminderEmail, smtpSettings, validEmail } from './mail.js';
import { shiftIcs, shiftChanges, SHIFT_KINDS } from './ics.js';
import { ruleOf, lateCancel, noShows, resolveLate, weekOf, weeklyReport, bcToday, addDays, dow, startMs, closeMs } from './fees.js';
import { ergGroupsText, parseErgGroups, pickPromotion, bcTime } from './waitlist.js';

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
  if (!cfg) { console.warn('mail: SMTP not configured – skipped', key); return false; }
  const ref = db.doc('mailLog/' + key);
  const toLabel = typeof to === 'string' ? to : (to.label || `${to.bcc.length} admin${to.bcc.length === 1 ? '' : 's'}`);
  try { await ref.create({ to: toLabel, subject: msg.subject, at: new Date().toISOString(), status: 'sending' }); }
  catch (e) { console.log('mail: already sent', key); return; }
  try {
    const t = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.auth });
    const rcpt = typeof to === 'string' ? { to } : { to: cfg.from, bcc: to.bcc };
    const info = await t.sendMail({ from: cfg.from, ...rcpt, subject: msg.subject, text: msg.text, html: msg.html, ...(msg.attachments ? { attachments: msg.attachments } : {}), ...(msg.icalEvent ? { icalEvent: msg.icalEvent } : {}) });
    await ref.update({ status: 'sent', messageId: info.messageId || null });
    return true;
  } catch (e) {
    console.error('mail: send failed', key, e && e.message);
    await ref.update({ status: 'failed', error: String(e && e.message || e).slice(0, 300) });
    return false;
  }
}
export const emailOnApproval = onDocumentCreated({ document: 'accounts/{uid}', region: REGION }, async (event) => {
  const uid = event.params.uid, acct = event.data && event.data.data();
  if (!acct || !acct.memberId || acct.via === 'invite') return;            // invited people already had an email
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
async function adminEmails(prefKey = 'issueEmails') {
  const uids = new Set((await db.collection('admins').get()).docs.map(d => d.id));
  const settings = await db.doc('config/settings').get();
  if (settings.exists && settings.data().ownerUid) uids.add(settings.data().ownerUid);
  const out = new Set();
  for (const uid of uids) {
    const pref = await db.doc('memberPrefs/' + uid).get();
    if (pref.exists && pref.data()[prefKey] === false) continue;   // admin opted out of this kind of email
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

// Email everyone booked on a session date when a coach/admin cancels it (occurrences/{sid_YYYYMMDD}
// cancelled → true with notify), and again if it's reinstated with notifyReinstate.
async function emailForMember(memberId) {
  const m = await db.doc('members/' + memberId).get();
  const uid = m.exists ? m.data().linkedUser : null;
  if (uid) { const e = await memberEmail(uid, null); if (e) return e; }
  const p = await db.doc('memberPrivate/' + memberId).get();
  return p.exists && validEmail(p.data().email) ? p.data().email : null;
}
export const emailOnCancel = onDocumentWritten({ document: 'occurrences/{id}', region: REGION }, async (event) => {
  const before = (event.data.before && event.data.before.data()) || {}, after = (event.data.after && event.data.after.data()) || null;
  if (!after) return;
  const cancelled = !before.cancelled && after.cancelled && after.notify !== false;
  const reinstated = before.cancelled && !after.cancelled && after.notifyReinstate === true;
  if (!cancelled && !reinstated) return;
  const sid = after.sessionId, date = after.date;
  if (!sid || !date) return;
  const [sess, bk] = await Promise.all([db.doc('sessions/' + sid).get(), db.collection('bookings').where('sessionId', '==', sid).where('date', '==', date).get()]);
  const ids = new Set();
  bk.docs.forEach(d => { const b = d.data(); (b.crew || []).filter(Boolean).forEach(x => ids.add(x)); if (b.cox) ids.add(b.cox); });
  const emails = new Set();
  for (const mid of ids) { const e = await emailForMember(mid); if (e) emails.add(e.toLowerCase()); }
  if (!emails.size) return console.log('cancel: nobody to email', event.params.id);
  const s = sess.exists ? sess.data() : {};
  const msg = cancelEmail({ title: s.title || 'Your session', date, start: s.start, end: s.end, reasonCode: after.reasonCode, reason: after.reason, notes: reinstated ? after.reinstateNotes : after.cancelNotes, by: after.cancelledBy, reinstated });
  const stamp = String((reinstated ? after.reinstatedAt : after.cancelledAt) || Date.now()).replace(/\W/g, '');
  await sendOnce(`${reinstated ? 'reinstate' : 'cancel'}_${event.params.id}_${stamp}`, { bcc: [...emails], label: `${emails.size} member${emails.size === 1 ? '' : 's'}` }, msg);
});

// Email admins when someone asks to join / link their profile (claims/{uid} becomes pending).
export const emailAdminsOnClaim = onDocumentWritten({ document: 'claims/{uid}', region: REGION }, async (event) => {
  const before = (event.data.before && event.data.before.data()) || null, after = (event.data.after && event.data.after.data()) || null;
  if (!after || after.status !== 'pending' || (before && before.status === 'pending')) return;
  const uid = event.params.uid;
  if (after.type === 'invite' || await matchingInvite(uid, after)) return;      // linked automatically, no admin needed
  const [p, m] = await Promise.all([db.doc('profiles/' + uid).get(), after.memberId ? db.doc('members/' + after.memberId).get() : null]);
  const to = await adminEmails('claimEmails');
  if (!to.length) return console.warn('mail: no admin emails for claim', uid);
  const msg = claimAdminEmail({ requester: p.exists ? p.data().name : '', type: after.type, memberName: m && m.exists ? m.data().displayName : '',
    firstName: after.firstName, lastName: after.lastName, programs: after.programs || [], email: after.email, phone: after.phone, memberNo: after.memberNo, note: after.note, at: after.at });
  await sendOnce(`claim_${uid}_${String(after.at || Date.now()).replace(/\W/g, '')}`, { bcc: to }, msg);
});

// Erg waitlist: when an erg booking is cancelled (deleted) or everyone leaves it before the session
// starts, give that erg to the first person waiting in the same group (Masters / Intermediate …)
// and email them. Waitlist entries live in waitlist/{sid}_{YYYYMMDD}_{memberId} {group, t}.
const people = b => [...(b.crew || []), b.cox].filter(Boolean);
export const ergWaitlistPromote = onDocumentWritten({ document: 'bookings/{id}', region: REGION }, async (event) => {
  const before = (event.data.before && event.data.before.data()) || null, after = (event.data.after && event.data.after.data()) || null;
  if (!before || !before.erg || !before.sessionId || !before.date) return;
  if (!people(before).length || (after && people(after).length)) return;   // not a seat being freed
  const sid = before.sessionId, date = before.date, erg = before.erg, ymd = date.replace(/-/g, '');
  const [sess, occ] = await Promise.all([db.doc('sessions/' + sid).get(), db.doc('occurrences/' + sid + '_' + ymd).get()]);
  if (!sess.exists) return;
  const s = sess.data(), o = occ.exists ? occ.data() : {};
  if (s.type !== 'erg' || o.cancelled) return;
  if (Date.now() >= bcTime(date, s.start).getTime()) return;               // session already started
  const groups = parseErgGroups(ergGroupsText(sid, s));
  const overflow = Date.now() >= bcTime(date, s.ergOpenTime || '12:00').getTime();
  const cap = o.capacity || s.capacity || 0;
  const promoted = await db.runTransaction(async (tx) => {
    const [bk, wl] = await Promise.all([
      tx.get(db.collection('bookings').where('sessionId', '==', sid).where('date', '==', date)),
      tx.get(db.collection('waitlist').where('sessionId', '==', sid).where('date', '==', date))]);
    const live = bk.docs.map(d => d.data()).filter(b => people(b).length);
    if (live.some(b => b.erg === erg)) return null;                         // someone already took it
    if (cap && live.length >= cap) return null;
    const booked = new Set(live.flatMap(people));
    const entries = wl.docs.map(d => ({ ref: d.ref, ...d.data() }));
    const pick = pickPromotion({ groups, erg, entries, booked, overflow });
    if (!pick) return null;
    const m = await tx.get(db.doc('members/' + pick.memberId));
    const ref = db.collection('bookings').doc();
    tx.set(ref, { sessionId: sid, date, boatId: null, rig: '', crew: [pick.memberId], cox: null, open: false, notes: 'From the waitlist',
      erg, captain: pick.memberId, createdBy: (m.exists && m.data().linkedUser) || pick.by || null, at: new Date().toISOString(), fromWaitlist: true });
    tx.delete(pick.ref);
    entries.filter(e => booked.has(e.memberId)).forEach(e => tx.delete(e.ref));   // tidy: already booked
    return { memberId: pick.memberId, bookingId: ref.id, name: m.exists ? m.data().displayName : '' };
  });
  if (!promoted) return;
  console.log('waitlist: erg', erg, sid, date, '→', promoted.memberId);
  const to = await emailForMember(promoted.memberId);
  if (!to) return;
  await sendOnce(`waitlist_${promoted.bookingId}`, to, waitlistEmail({ firstName: (promoted.name || '').split(' ')[0], title: s.title || 'Erg session', date, start: s.start, end: s.end, erg,
    link: `https://vrc-rower-s-portal.web.app/#s-${sid}-${ymd}` }));
});

// ---------------------------------------------------------------------------------------------
// No-show / late-cancel fees (admins switch them on per program: feeRules/{programId}).
// See functions/fees.js for the rules. Fees live in fees/{late|noshow}_{sid}_{YYYYMMDD}_{memberId}.
const docsMap = snap => Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
const ymdOf = d => d.replace(/-/g, '');
async function memberName(id) { const m = await db.doc('members/' + id).get(); return m.exists ? (m.data().displayName || id) : id; }
async function programName(id) { const p = await db.doc('programs/' + id).get(); return p.exists ? (p.data().name || id) : id; }
async function isAdminUid(uid) {
  if (!uid) return false;
  if ((await db.doc('admins/' + uid).get()).exists) return true;
  const st = await db.doc('config/settings').get(); return st.exists && st.data().ownerUid === uid;
}

// 1) Late cancel: someone takes themselves out of a booking inside the late window.
//    Only the person who cancelled is charged (not crewmates of a captain who cancels the boat),
//    never when an admin removes someone. The fee stays "pending" until class time.
export const feeOnCancel = onDocumentWrittenWithAuthContext({ document: 'bookings/{id}', region: REGION }, async (event) => {
  const before = (event.data.before && event.data.before.data()) || null, after = (event.data.after && event.data.after.data()) || null;
  if (!before || !before.sessionId || !before.date) return;
  const left = people(before).filter(m => !(after ? people(after) : []).includes(m));
  if (!left.length) return;
  const now = Date.now();
  const sess = await db.doc('sessions/' + before.sessionId).get(); if (!sess.exists) return;
  const s = sess.data();
  const rules = { [s.programId]: (await db.doc('feeRules/' + s.programId).get()).data() };
  const rule = ruleOf(rules, s.programId); if (!rule) return;
  const hrs = lateCancel(rule, before.date, s, now); if (hrs == null) return;
  const occ = await db.doc('occurrences/' + before.sessionId + '_' + ymdOf(before.date)).get();
  if (occ.exists && occ.data().cancelled) return;                       // the class itself was cancelled
  // who did it?
  const uid = event.authId || null;
  let actor = null;
  if (uid) { const a = await db.doc('accounts/' + uid).get(); actor = a.exists ? a.data().memberId : null; }
  let charge;
  if (actor) charge = left.filter(m => m === actor);                    // only your own spot
  else if (uid && await isAdminUid(uid)) charge = [];                   // an admin removed them
  else if (!uid && event.authType === 'system') charge = [];            // the portal itself
  else charge = left.length === 1 ? left : [];                          // unknown: single-person cancel
  if (!charge.length) return;
  const snap = await db.collection('bookings').where('sessionId', '==', before.sessionId).where('date', '==', before.date).get();
  const snapshot = [...new Set(snap.docs.flatMap(d => people(d.data())))];
  const pname = await programName(s.programId);
  for (const m of charge) {
    if (snapshot.includes(m)) continue;                                 // still booked (moved boats)
    const id = `late_${before.sessionId}_${ymdOf(before.date)}_${m}`;
    try {
      await db.doc('fees/' + id).create({ memberId: m, memberName: await memberName(m), type: 'late', programId: s.programId, program: pname,
        sessionId: before.sessionId, sessionTitle: s.title || '', date: before.date, start: s.start || '', amount: rule.lateFee, hoursBefore: hrs,
        lateHours: rule.lateHours, closeMin: rule.closeMin, status: 'pending', snapshot, at: new Date(now).toISOString(), by: uid });
    } catch (e) { /* already has one for this class */ }
  }
});

// 2) Every 10 minutes: once a class has closed (start + closeMin), settle its pending late cancels and
//    charge no-shows from the coach's check-in. Each class is handled once (feeRuns/{sid}_{YYYYMMDD}).
async function feeSweep(now = Date.now()) {
  const rules = docsMap(await db.collection('feeRules').get());
  if (!Object.values(rules).some(r => r.enabled)) return { classes: 0 };
  const sessions = docsMap(await db.collection('sessions').get());
  const today = bcToday(now), dates = [addDays(today, -2), addDays(today, -1), today];
  let n = 0;
  for (const [sid, s] of Object.entries(sessions)) {
    const rule = ruleOf(rules, s.programId);
    if (!rule || s.active === false || !s.start) continue;
    for (const d of dates.filter(x => dow(x) === (s.weekday ?? -1))) {
      if (now < closeMs(d, s, rule)) continue;
      const runRef = db.doc(`feeRuns/${sid}_${ymdOf(d)}`), run = (await runRef.get()).data() || {};
      if (run.done) continue;
      n++;
      const occ = (await db.doc(`occurrences/${sid}_${ymdOf(d)}`).get()).data() || {};
      const pend = await db.collection('fees').where('sessionId', '==', sid).where('date', '==', d).where('status', '==', 'pending').get();
      if (occ.cancelled) {
        await Promise.all(pend.docs.map(f => f.ref.update({ status: 'waived', waiveNote: 'Class cancelled', updatedAt: new Date().toISOString() })));
        await runRef.set({ done: true, cancelled: true, at: new Date().toISOString(), sessionId: sid, date: d }); continue;
      }
      const bk = await db.collection('bookings').where('sessionId', '==', sid).where('date', '==', d).get();
      const booked = [...new Set(bk.docs.flatMap(x => people(x.data())))];
      if (!run.lateDone) {
        for (const r of resolveLate(pend.docs.map(f => ({ id: f.id, ...f.data() })), booked))
          await db.doc('fees/' + r.id).update(r.status === 'waived'
            ? { status: 'waived', waiveNote: r.rebooked ? 'Booked back in' : 'Spot filled by ' + await memberName(r.filledBy), updatedAt: new Date().toISOString() }
            : { status: 'charged', updatedAt: new Date().toISOString() });
        await runRef.set({ lateDone: true, sessionId: sid, date: d }, { merge: true });
      }
      if (!(rule.noShowFee > 0)) { await runRef.set({ done: true, at: new Date().toISOString() }, { merge: true }); continue; }
      const att = await db.doc(`attendance/${sid}_${ymdOf(d)}`).get();
      const ns = noShows(booked, att.exists ? att.data() : null);
      if (ns == null) {                                     // no check-in yet: wait until the day is over
        if (d < today) await runRef.set({ done: true, noAttendance: true, booked: booked.length, programId: s.programId, at: new Date().toISOString() }, { merge: true });
        continue;
      }
      const pname = await programName(s.programId);
      for (const m of ns) {
        try {
          await db.doc(`fees/noshow_${sid}_${ymdOf(d)}_${m}`).create({ memberId: m, memberName: await memberName(m), type: 'noshow', programId: s.programId, program: pname,
            sessionId: sid, sessionTitle: s.title || '', date: d, start: s.start || '', amount: rule.noShowFee, closeMin: rule.closeMin, lateHours: rule.lateHours,
            status: 'charged', at: new Date().toISOString() });
        } catch (e) { /* exists */ }
      }
      await runRef.set({ done: true, noShows: ns.length, booked: booked.length, at: new Date().toISOString() }, { merge: true });
    }
  }
  return { classes: n };
}
export const feeSweepEvery10 = onSchedule({ schedule: 'every 10 minutes', region: REGION, timeZone: 'Etc/GMT+7' }, () => feeSweep());

// 3) A coach corrects check-in after a no-show fee → remove it.
export const feeOnAttendance = onDocumentWritten({ document: 'attendance/{id}', region: REGION }, async (event) => {
  const a = event.data.after && event.data.after.data(); if (!a) return;
  const fees = await db.collection('fees').where('sessionId', '==', a.sessionId).where('date', '==', a.date).where('type', '==', 'noshow').where('status', '==', 'charged').get();
  for (const f of fees.docs) {
    const mk = (a.marks || {})[f.data().memberId];
    if (mk === 'present' || mk === 'late') await f.ref.update({ status: 'waived', waiveNote: 'Checked in by coach', updatedAt: new Date().toISOString() });
  }
});

// 4) Emails to the member: when a fee becomes "charged", and when a charged fee is removed.
export const feeEmails = onDocumentWritten({ document: 'fees/{id}', region: REGION }, async (event) => {
  const before = event.data.before && event.data.before.data(), f = event.data.after && event.data.after.data();
  if (!f || (before && before.status === f.status)) return;
  const first = String(f.memberName || '').split(' ')[0];
  const to = await emailForMember(f.memberId); if (!to) return;
  if (f.status === 'charged')
    await sendOnce(`fee_${event.params.id}${before && before.status === 'waived' ? '_' + Date.now() : ''}`, to,
      feeEmail({ firstName: first, type: f.type, amount: f.amount, title: f.sessionTitle, date: f.date, start: f.start, hoursBefore: f.hoursBefore, lateHours: f.lateHours, closeMin: f.closeMin }));
  else if (f.status === 'waived' && before && before.status === 'charged')
    await sendOnce(`feewaived_${event.params.id}_${Date.now()}`, to, feeWaivedEmail({ firstName: first, type: f.type, amount: f.amount, title: f.sessionTitle, date: f.date }));
});

// 5) Weekly report to admins (Sunday 8 PM Vancouver time, Monday–Sunday), or on request to one admin.
async function buildFeeReport(now = Date.now()) {
  const { from, to } = weekOf(now);
  const fees = (await db.collection('fees').where('date', '>=', from).where('date', '<=', to).get()).docs.map(d => d.data());
  const runs = (await db.collection('feeRuns').where('noAttendance', '==', true).get()).docs.map(d => d.data()).filter(r => r.date >= from && r.date <= to);
  const sessions = docsMap(await db.collection('sessions').get()), programs = docsMap(await db.collection('programs').get());
  const missing = runs.map(r => ({ date: r.date, sessionTitle: (sessions[r.sessionId] || {}).title || r.sessionId, program: (programs[r.programId] || {}).name || r.programId || '', booked: r.booked || 0 }));
  return weeklyReport({ fees, missing, from, to });
}
export const feeWeeklyReport = onSchedule({ schedule: '0 20 * * 0', region: REGION, timeZone: 'Etc/GMT+7' }, async () => {
  const rules = docsMap(await db.collection('feeRules').get());
  if (!Object.values(rules).some(r => r.enabled)) return;
  const r = await buildFeeReport();
  const bcc = await adminEmails('feeReports'); if (!bcc.length) return;
  await sendOnce(`feereport_${weekOf(Date.now()).from}`, { bcc }, feeReportEmail(r));
});
export const feeReportOnRequest = onDocumentWritten({ document: 'feeReports/request', region: REGION }, async (event) => {
  const q = event.data.after && event.data.after.data(); if (!q || !q.by) return;
  if (!(await isAdminUid(q.by))) return;
  const to = await memberEmail(q.by, null); if (!to) return;
  await sendOnce(`feereport_req_${Date.now()}`, to, feeReportEmail(await buildFeeReport()));
});

// ---------------------------------------------------------------------------------------------
// Invitations: an admin creates invites/{token} {memberId, email, expiresAt, status:'pending'} from the
// portal → we email a one-time link (SITE/?invite=token). The invitee signs in; the app writes their own
// claims/{uid} {type:'invite', invite:token} and we link the account (same steps as approving a request).
// Fallback: a normal "This is me" request for a member with a pending invite to the same email is
// linked automatically too (e.g. they opened the link on another device).
export const inviteOnCreate = onDocumentCreated({ document: 'invites/{token}', region: REGION }, async (event) => {
  const v = event.data.data(); if (!v || v.status !== 'pending' || !validEmail(v.email)) return;
  const m = await db.doc('members/' + v.memberId).get(); if (!m.exists) return;
  const md = m.data();
  const expires = new Date(v.expiresAt).toLocaleDateString('en-CA', { timeZone: 'Etc/GMT+7', month: 'long', day: 'numeric' });
  const r = await sendOnce(`invite_${event.params.token}`, v.email, inviteEmail({ firstName: md.firstName, memberName: md.displayName, programs: md.programs || [],
    link: `${SITE}/?invite=${event.params.token}`, inviter: v.byName, expires }));
  if (r === false) await event.data.ref.update({ mailError: 'the email could not be sent (see Recent emails)' }).catch(() => {});
});

async function authEmail(uid) { try { return String((await getAuth().getUser(uid)).email || '').toLowerCase(); } catch (e) { return ''; } }
async function matchingInvite(uid, claim) {
  if (!claim || claim.type !== 'existing' || !claim.memberId) return null;
  const email = await authEmail(uid); if (!email) return null;
  const q = await db.collection('invites').where('memberId', '==', claim.memberId).where('email', '==', email).where('status', '==', 'pending').get();
  const now = new Date().toISOString();
  const d = q.docs.find(x => (x.data().expiresAt || '') > now);
  return d ? { ref: d.ref, ...d.data() } : null;
}
export const inviteRedeem = onDocumentWritten({ document: 'claims/{uid}', region: REGION }, async (event) => {
  const c = event.data.after && event.data.after.data(); if (!c || c.status !== 'pending') return;
  const uid = event.params.uid, claimRef = event.data.after.ref;
  let inv = null;
  const fail = msg => claimRef.update({ status: 'invite_failed', inviteError: msg });
  if (c.type === 'invite') {
    if (!c.invite || !/^[A-Za-z0-9_-]{20,80}$/.test(c.invite)) return fail('the link is incomplete');
    const s = await db.doc('invites/' + c.invite).get();
    if (!s.exists) return fail('the link isn’t recognised');
    inv = { ref: s.ref, ...s.data() };
    if (inv.status === 'used') return fail(inv.usedBy === uid ? 'it was already used' : 'it has already been used');
    if (inv.status !== 'pending') return fail('it was withdrawn');
    if ((inv.expiresAt || '') < new Date().toISOString()) return fail('it has expired – ask an admin to send a new one');
  } else {
    inv = await matchingInvite(uid, c); if (!inv) return;
  }
  const mid = inv.memberId, mRef = db.doc('members/' + mid);
  const [m, acct, priv, prefs] = await Promise.all([mRef.get(), db.doc('accounts/' + uid).get(), db.doc('memberPrivate/' + mid).get(), db.doc('memberPrefs/' + mid).get()]);
  if (!m.exists) return fail('that member profile no longer exists');
  if (m.data().linkedUser && m.data().linkedUser !== uid) return fail('that member profile is already linked to another account');
  if (acct.exists && acct.data().memberId !== mid) return fail('this sign-in is already linked to a different member');
  const now = new Date().toISOString(), md = m.data();
  const b = db.batch();
  b.update(mRef, { linkedUser: uid, linkedAt: now, updatedAt: now, ...(md.status === 'inactive' ? { status: 'active' } : {}) });
  const p = priv.exists ? priv.data() : {};
  b.set(db.doc('memberPrivate/' + uid), { ...p, email: p.email || inv.email, updatedAt: now });
  if (priv.exists) b.delete(priv.ref);
  if (prefs.exists) { b.set(db.doc('memberPrefs/' + uid), prefs.data()); b.delete(prefs.ref); }
  b.set(db.doc('accounts/' + uid), { memberId: mid, linkedAt: now, via: 'invite' });
  if (md.siteAdmin) b.set(db.doc('admins/' + uid), { memberId: mid, since: now });
  b.update(inv.ref, { status: 'used', usedBy: uid, usedAt: now });
  b.delete(claimRef);
  await b.commit();
  console.log('invite: linked', uid, '→', mid);
});

// ---------------------------------------------------------------------------------------------
// Boats away on trips: when a regatta takes boats out of booking (boatHolds/{id}), email every crew that already
// booked one of those boats in the away window, once per booking and boat, asking them to switch boats.
export const emailOnBoatHold = onDocumentWritten({ document: 'boatHolds/{id}', region: REGION }, async (event) => {
  const h = event.data.after && event.data.after.data(); if (!h || !(h.boatIds || []).length || !h.from || !h.to) return;
  const today = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10);
  const from = h.from > today ? h.from : today; if (from > h.to) return;
  const bk = await db.collection('bookings').where('date', '>=', from).where('date', '<=', h.to).get();
  for (const d of bk.docs) {
    const b = d.data(); if (!b.boatId || !h.boatIds.includes(b.boatId)) continue;
    const who = people(b); if (!who.length) continue;
    const [boat, sess] = await Promise.all([db.doc('boats/' + b.boatId).get(), db.doc('sessions/' + b.sessionId).get()]);
    const bcc = (await Promise.all(who.map(emailForMember))).filter(Boolean); if (!bcc.length) continue;
    const s = sess.exists ? sess.data() : {};
    await sendOnce(`boataway_${event.params.id}_${d.id}_${b.boatId}`, { bcc, label: 'crew' }, boatAwayEmail({ boat: boat.exists ? boat.data().name : 'your boat', regatta: h.name || 'a regatta',
      date: b.date, session: s.title || 'your session', from: h.from, to: h.to, link: `${SITE}/#s-${b.sessionId}-${b.date.replace(/-/g, '')}` }));
  }
});

// ---------------------------------------------------------------------------------------------
// Regattas for members. regattas/{id} is admin/committee-only; when it's published we mirror the member-facing part
// to regattaPublic/{id} (no fees, costs or files). Shift sign-ups (shiftSignups/{rid}_{shiftId}_{memberId}) get a
// calendar invite by email; changing a shift's time re-sends it with a higher SEQUENCE so calendars update the event,
// and a removed shift sends a cancellation.
const PUBLIC_KEYS = ['name', 'start', 'end', 'location', 'link', 'status', 'entryDeadline', 'shifts', 'recommended', 'pub'];
function publicOf(r) {
  const o = {}; PUBLIC_KEYS.forEach(k => { if (r[k] !== undefined) o[k] = r[k]; });
  o.entries = (r.entries || []).map(({ fee, ...e }) => e);
  o.updatedAt = new Date().toISOString();
  return o;
}
async function shiftMail(rid, r, shift, memberId, method, note) {
  const to = await emailForMember(memberId); if (!to) return;
  const m = await db.doc('members/' + memberId).get(); const first = m.exists ? String(m.data().displayName || '').split(' ')[0] : '';
  const kind = SHIFT_KINDS[shift.kind] || shift.label || 'Shift';
  const where = shift.place === 'venue' ? (r.location || 'the regatta venue') : 'VRC';
  const ics = shiftIcs({ uid: `shift-${rid}-${shift.id}-${memberId}@vrc-portal`, sequence: shift.version || 0, method, date: shift.date, start: shift.start, end: shift.end,
    summary: `${kind} – ${r.name}`, location: where, description: (shift.notes || '') + `\n${SITE}/#regatta-${rid}`, organizer: (smtpSettings() || {}).user || undefined, attendee: to });
  const v = shift.version || 0;
  await sendOnce(`shift_${rid}_${shift.id}_${memberId}_${method}_v${v}`, to, {
    ...shiftEmail({ firstName: first, kind, regatta: r.name, date: shift.date, start: shift.start, end: shift.end, where, notes: shift.notes, method, note, link: `${SITE}/#regatta-${rid}` }),
    icalEvent: { method: method.toLowerCase(), filename: 'shift.ics', content: ics } });
}
export const regattaMirror = onDocumentWritten({ document: 'regattas/{id}', region: REGION }, async (event) => {
  const rid = event.params.id, before = event.data.before && event.data.before.data(), r = event.data.after && event.data.after.data();
  const pubRef = db.doc('regattaPublic/' + rid);
  if (!r || !(r.pub && r.pub.published)) { await pubRef.delete().catch(() => {}); return; }
  await pubRef.set(publicOf(r));
  if (!before) return;
  const ch = shiftChanges(before.shifts || [], r.shifts || []);
  if (!ch.changed.length && !ch.removed.length) return;
  const sign = await db.collection('shiftSignups').where('regattaId', '==', rid).get();
  for (const d of sign.docs) {
    const x = d.data(), c = ch.changed.find(s => s.id === x.shiftId), gone = ch.removed.find(s => s.id === x.shiftId);
    if (c) await shiftMail(rid, r, c, x.memberId, 'REQUEST', 'The time or place of this shift has changed – your calendar has been updated.');
    if (gone) { await shiftMail(rid, r, { ...gone, version: (gone.version || 0) + 1 }, x.memberId, 'CANCEL', 'This shift has been cancelled.'); await d.ref.delete(); }
  }
});
export const shiftSignupInvite = onDocumentWritten({ document: 'shiftSignups/{id}', region: REGION }, async (event) => {
  const before = event.data.before && event.data.before.data(), after = event.data.after && event.data.after.data();
  const x = after || before; if (!x || !x.regattaId) return;
  const r = (await db.doc('regattaPublic/' + x.regattaId).get()).data(); if (!r) return;
  const shift = (r.shifts || []).find(s => s.id === x.shiftId); if (!shift) return;
  if (after && !before) await shiftMail(x.regattaId, r, shift, x.memberId, 'REQUEST', x.kind === 'group' ? 'A crewmate signed you up for this shift.' : x.kind === 'sub' ? 'You’re covering this shift as a substitute.' : '');
  if (before && !after) await shiftMail(x.regattaId, r, { ...shift, version: (shift.version || 0) + 1 }, x.memberId, 'CANCEL', 'You’re no longer on this shift.');
});
// Daily 08:00 (UTC-7): entry-deadline reminders to admins + regatta committee (7 and 2 days before), and a reminder
// the day before each shift to everyone signed up.
export const regattaReminders = onSchedule({ schedule: '0 8 * * *', region: REGION, timeZone: 'Etc/GMT+7' }, async () => {
  const today = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10);
  const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const regs = await db.collection('regattas').get();
  let committee = null;
  for (const d of regs.docs) {
    const r = d.data();
    for (const n of [7, 2]) if (r.entryDeadline && r.entryDeadline === add(today, n)) {
      if (!committee) {
        const mem = await db.collection('members').where('roles', 'array-contains', 'regatta').get();
        committee = [...new Set([...(await adminEmails('regattaEmails')), ...(await Promise.all(mem.docs.map(x => emailForMember(x.id)))).filter(Boolean)])];
      }
      if (committee.length) await sendOnce(`deadline_${d.id}_${n}`, { bcc: committee, label: 'regatta committee' }, deadlineEmail({ regatta: r.name, deadline: r.entryDeadline, days: n, entries: (r.entries || []).length, link: `${SITE}/#regatta-${d.id}` }));
    }
    const tomorrow = add(today, 1);
    for (const sh of (r.shifts || []).filter(x => x.date === tomorrow)) {
      const sign = await db.collection('shiftSignups').where('regattaId', '==', d.id).where('shiftId', '==', sh.id).get();
      for (const x of sign.docs) {
        const to = await emailForMember(x.data().memberId); if (!to) continue;
        await sendOnce(`shiftrem_${d.id}_${sh.id}_${x.data().memberId}_${sh.date}`, to, shiftReminderEmail({ kind: SHIFT_KINDS[sh.kind] || 'Shift', regatta: r.name, date: sh.date, start: sh.start, end: sh.end,
          where: sh.place === 'venue' ? (r.location || 'the venue') : 'VRC', notes: sh.notes, link: `${SITE}/#regatta-${d.id}` }));
      }
    }
  }
});
