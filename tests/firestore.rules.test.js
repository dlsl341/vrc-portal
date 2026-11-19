// Security-rule tests for the VRC Rowing Portal. Run with `npm test` (needs Java + the
// Firebase emulator) – GitHub runs them automatically on every pull request and before each deploy.
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vrc-portal',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
after(async () => { await env.cleanup(); });

// owner  – portal owner (config/settings)
// carol  – admin (admins/carol)
// alice, bob – linked members
// stranger – signed in, not linked yet
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put('config/settings', { ownerUid: 'owner' });
    await put('admins/carol', { memberId: 'm_carol' });
    await put('accounts/alice', { memberId: 'm_alice' });
    await put('accounts/bob', { memberId: 'm_bob' });
    await put('members/m_alice', { displayName: 'Alice', linkedUser: 'alice' });
    await put('boats/b1', { name: 'Atlanta', status: 'available' });
    await put('memberPrivate/alice', { email: 'alice@example.com' });
    await put('bookings/k1', { sessionId: 's1', date: '2026-11-22', boatId: 'b1', crew: ['m_alice', null], cox: null,
      open: true, captain: 'm_alice', createdBy: 'alice', notes: '' });
    await put('bookings/closed', { sessionId: 's1', date: '2026-11-22', boatId: 'b2', crew: ['m_alice', null], cox: null,
      open: false, captain: 'm_alice', createdBy: 'alice', notes: '' });
    await put('accounts/dan', { memberId: 'm_dan' });
    await put('members/m_dan', { displayName: 'Dan (coach)', linkedUser: 'dan', roles: ['rower', 'coach'] });
    await put('members/m_bob', { displayName: 'Bob', linkedUser: 'bob', roles: ['rower'] });
    await put('maintJobs/j1', { boatId: 'b1', task: 'Rigging check', date: '2026-11-25', start: '13:00', end: '15:00',
      crew: ['m_alice'], crewNeeded: 3, status: 'scheduled' });
    await put('results/r1', { memberId: 'm_alice', by: 'alice', date: '2026-11-16', type: 'erg', program: 'Masters',
      km: 10, timeSec: 2700, likes: {} });
    await put('issues/i1', { boatId: 'b1', status: 'open', by: 'alice', description: 'Crack', photos: [] });
  });
});

const as = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const booking = (over = {}) => ({ sessionId: 's1', date: '2026-11-22', boatId: 'b3', crew: ['m_bob'], cox: null,
  open: false, captain: 'm_bob', createdBy: 'bob', notes: '', ...over });

// ---- signed out & strangers
test('signed-out visitors can read nothing', async () => {
  await assertFails(getDoc(doc(anon(), 'members/m_alice')));
  await assertFails(getDoc(doc(anon(), 'boats/b1')));
});
test('a stranger can find themselves in the directory but sees no club data', async () => {
  const db = as('stranger');
  await assertSucceeds(getDoc(doc(db, 'members/m_alice')));
  await assertFails(getDoc(doc(db, 'boats/b1')));
  await assertFails(getDocs(collection(db, 'bookings')));
});
test('a stranger can send their own profile request, but not for someone else', async () => {
  const db = as('stranger');
  await assertSucceeds(setDoc(doc(db, 'claims/stranger'), { type: 'existing', memberId: 'm_x', status: 'pending' }));
  await assertFails(setDoc(doc(db, 'claims/bob'), { type: 'existing', memberId: 'm_x', status: 'pending' }));
  await assertFails(setDoc(doc(db, 'claims/stranger'), { type: 'existing', memberId: 'm_x', status: 'approved' }));
});
test('nobody can take over an already set-up portal', async () => {
  await assertFails(setDoc(doc(as('stranger'), 'config/settings'), { ownerUid: 'stranger' }));
  await assertFails(updateDoc(doc(as('carol'), 'config/settings'), { ownerUid: 'carol' }));
});
test('a stranger cannot make themselves a member or admin', async () => {
  const db = as('stranger');
  await assertFails(setDoc(doc(db, 'accounts/stranger'), { memberId: 'm_alice' }));
  await assertFails(setDoc(doc(db, 'admins/stranger'), { memberId: 'm_x' }));
});

// ---- members
test('members read club data but cannot change boats', async () => {
  const db = as('bob');
  await assertSucceeds(getDoc(doc(db, 'boats/b1')));
  await assertFails(updateDoc(doc(db, 'boats/b1'), { status: 'dnr' }));
});
test('private details: only yourself and admins', async () => {
  await assertSucceeds(getDoc(doc(as('alice'), 'memberPrivate/alice')));
  await assertFails(getDoc(doc(as('bob'), 'memberPrivate/alice')));
  await assertSucceeds(getDoc(doc(as('carol'), 'memberPrivate/alice')));
  await assertSucceeds(getDoc(doc(as('owner'), 'memberPrivate/alice')));
});
test('members book boats only with themselves in the crew', async () => {
  const db = as('bob');
  await assertSucceeds(setDoc(doc(db, 'bookings/n1'), booking()));
  await assertFails(setDoc(doc(db, 'bookings/n2'), booking({ crew: ['m_alice'] })));
  await assertFails(setDoc(doc(db, 'bookings/n3'), booking({ createdBy: 'alice' })));
});
test('anyone can join an open seat, but not change anything else', async () => {
  const db = as('bob');
  await assertSucceeds(updateDoc(doc(db, 'bookings/k1'), { crew: ['m_alice', 'm_bob'], open: false }));
  await assertFails(updateDoc(doc(db, 'bookings/k1'), { notes: 'mine now' }));
  await assertFails(updateDoc(doc(db, 'bookings/closed'), { crew: ['m_alice', 'm_bob'] }));
});
test('only the booker or an admin can cancel a booking', async () => {
  await assertFails(deleteDoc(doc(as('bob'), 'bookings/k1')));
  await assertSucceeds(deleteDoc(doc(as('alice'), 'bookings/k1')));
  await assertSucceeds(deleteDoc(doc(as('carol'), 'bookings/closed')));
});
test('crew can leave a booking they are in', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'bookings/k1'), { crew: ['m_alice', 'm_bob'] }));
  await assertSucceeds(updateDoc(doc(as('bob'), 'bookings/k1'), { crew: ['m_alice', null], open: true }));
});
test('damage reports: reporters can add photos only; admins resolve', async () => {
  await assertSucceeds(setDoc(doc(as('bob'), 'issues/i2'), { boatId: 'b1', status: 'open', by: 'bob', description: 'x' }));
  await assertFails(setDoc(doc(as('bob'), 'issues/i3'), { boatId: 'b1', status: 'open', by: 'alice', description: 'x' }));
  await assertSucceeds(updateDoc(doc(as('alice'), 'issues/i1'), { photos: ['https://x'] }));
  await assertFails(updateDoc(doc(as('alice'), 'issues/i1'), { status: 'resolved' }));
  await assertSucceeds(updateDoc(doc(as('carol'), 'issues/i1'), { status: 'resolved' }));
});

// ---- admins
test('admins and the owner manage club data and admin roles', async () => {
  await assertSucceeds(updateDoc(doc(as('carol'), 'boats/b1'), { status: 'dnr' }));
  await assertSucceeds(updateDoc(doc(as('owner'), 'boats/b1'), { status: 'available' }));
  // a member can't promote anyone (checked before alice is promoted below)
  await assertFails(setDoc(doc(as('alice'), 'admins/bob'), { memberId: 'm_bob' }));
  await assertFails(setDoc(doc(as('alice'), 'admins/alice'), { memberId: 'm_alice' }));
  await assertSucceeds(setDoc(doc(as('carol'), 'admins/alice'), { memberId: 'm_alice' }));
  // ...and once promoted, she can
  await assertSucceeds(setDoc(doc(as('alice'), 'admins/bob'), { memberId: 'm_bob' }));
});

// ---- results & likes
const result = (over = {}) => ({ memberId: 'm_bob', by: 'bob', date: '2026-11-16', type: 'erg', program: 'Masters',
  km: 5, timeSec: 1300, likes: {}, ...over });
test('members log their own results, not someone else\'s; strangers cannot log', async () => {
  await assertSucceeds(setDoc(doc(as('bob'), 'results/rb'), result()));
  await assertFails(setDoc(doc(as('bob'), 'results/rx'), result({ memberId: 'm_alice' })));
  await assertFails(setDoc(doc(as('bob'), 'results/ry'), result({ by: 'alice' })));
  await assertFails(setDoc(doc(as('bob'), 'results/rz'), result({ likes: { bob: 'x' } })));
  await assertFails(setDoc(doc(as('stranger'), 'results/rs'), result({ memberId: 'm_s', by: 'stranger' })));
  await assertFails(getDoc(doc(as('stranger'), 'results/r1')));
});
test('anyone in the club can like a result, but only with their own like', async () => {
  const bob = as('bob');
  await assertSucceeds(updateDoc(doc(bob, 'results/r1'), { likes: { bob: '2026-11-17' } }));
  await assertSucceeds(updateDoc(doc(bob, 'results/r1'), { likes: {} }));                       // unlike
  await assertFails(updateDoc(doc(bob, 'results/r1'), { likes: { carol: '2026-11-17' } }));     // someone else's like
  await assertFails(updateDoc(doc(bob, 'results/r1'), { km: 50 }));                              // their numbers
  await assertFails(updateDoc(doc(bob, 'results/r1'), { km: 50, likes: { bob: 'x' } }));
  await assertFails(deleteDoc(doc(bob, 'results/r1')));
});
test('the owner of a result can edit and delete it; admins can too', async () => {
  await assertSucceeds(updateDoc(doc(as('alice'), 'results/r1'), { km: 11 }));
  await assertFails(updateDoc(doc(as('alice'), 'results/r1'), { memberId: 'm_bob' }));
  await assertSucceeds(updateDoc(doc(as('carol'), 'results/r1'), { km: 12 }));
  await assertSucceeds(deleteDoc(doc(as('alice'), 'results/r1')));
});

// ---- attendance
test('coaches and admins can check athletes in; other members can only look', async () => {
  const att = { sessionId: 's1', date: '2026-11-22', marks: { m_alice: 'present' } };
  await assertSucceeds(setDoc(doc(as('dan'), 'attendance/s1_20261122'), att));
  await assertSucceeds(updateDoc(doc(as('carol'), 'attendance/s1_20261122'), { 'marks.m_bob': 'absent' }));
  await assertFails(updateDoc(doc(as('bob'), 'attendance/s1_20261122'), { 'marks.m_bob': 'present' }));
  await assertFails(setDoc(doc(as('alice'), 'attendance/s1_20261123'), att));
  await assertSucceeds(getDoc(doc(as('bob'), 'attendance/s1_20261122')));
  await assertFails(getDoc(doc(as('stranger'), 'attendance/s1_20261122')));
});

// ---- scheduled maintenance
test('only admins schedule maintenance', async () => {
  const job = { boatId: 'b1', task: 'Wash', date: '2026-11-26', start: '13:00', end: '14:00', crew: [], status: 'scheduled' };
  await assertSucceeds(setDoc(doc(as('carol'), 'maintJobs/j2'), job));
  await assertFails(setDoc(doc(as('bob'), 'maintJobs/j3'), job));
  await assertFails(updateDoc(doc(as('bob'), 'maintJobs/j1'), { date: '2026-11-27' }));
  await assertFails(deleteDoc(doc(as('bob'), 'maintJobs/j1')));
});
test('members can join or leave a maintenance crew, but not move others', async () => {
  await assertSucceeds(updateDoc(doc(as('bob'), 'maintJobs/j1'), { crew: ['m_alice', 'm_bob'] }));   // join
  await assertSucceeds(updateDoc(doc(as('bob'), 'maintJobs/j1'), { crew: ['m_alice'] }));            // leave
  await assertFails(updateDoc(doc(as('bob'), 'maintJobs/j1'), { crew: [] }));                        // remove Alice
  await assertFails(updateDoc(doc(as('bob'), 'maintJobs/j1'), { crew: ['m_alice', 'm_x'] }));        // add someone else
});
test('the crew can mark a job done; others cannot', async () => {
  await assertFails(updateDoc(doc(as('bob'), 'maintJobs/j1'), { status: 'done' }));
  await assertSucceeds(updateDoc(doc(as('alice'), 'maintJobs/j1'), { status: 'done', doneNotes: 'All good' }));
});

// ---- Concept2 connection
test('Concept2 tokens are never readable or writable from the browser', async () => {
  await assertFails(getDoc(doc(as('alice'), 'c2Tokens/alice')));
  await assertFails(setDoc(doc(as('alice'), 'c2Tokens/alice'), { access: 'x' }));
  await assertFails(getDoc(doc(as('carol'), 'c2Users/123')));
  await assertFails(setDoc(doc(as('alice'), 'c2Users/123'), { uid: 'alice' }));
});
test('members start a Concept2 sign-in only for themselves, and see only their own link', async () => {
  await assertSucceeds(setDoc(doc(as('alice'), 'c2States/s1'), { uid: 'alice', at: '2026-11-18T00:00:00Z' }));
  await assertFails(setDoc(doc(as('alice'), 'c2States/s2'), { uid: 'bob', at: '2026-11-18T00:00:00Z' }));
  await assertFails(getDoc(doc(as('alice'), 'c2States/s1')));
  await assertSucceeds(getDoc(doc(as('alice'), 'c2Links/alice')));
  await assertFails(getDoc(doc(as('bob'), 'c2Links/alice')));
  await assertSucceeds(getDoc(doc(as('carol'), 'c2Links/alice')));
  await assertFails(setDoc(doc(as('alice'), 'c2Links/alice'), { connected: true }));
});

// ---- open erg
test('members book open erg time only for themselves; others cannot cancel it', async () => {
  const oe = { memberId: 'm_alice', by: 'alice', date: '2026-11-20', start: '14:00', end: '15:00', erg: 3 };
  await assertSucceeds(setDoc(doc(as('alice'), 'openErg/o1'), oe));
  await assertFails(setDoc(doc(as('alice'), 'openErg/o2'), { ...oe, memberId: 'm_bob' }));
  await assertFails(setDoc(doc(as('alice'), 'openErg/o3'), { ...oe, erg: 25 }));
  await assertFails(setDoc(doc(as('stranger'), 'openErg/o4'), { ...oe, by: 'stranger' }));
  await assertSucceeds(getDoc(doc(as('bob'), 'openErg/o1')));
  await assertFails(deleteDoc(doc(as('bob'), 'openErg/o1')));
  await assertSucceeds(deleteDoc(doc(as('alice'), 'openErg/o1')));
});

// ---- member emails log
test('only admins can see the email log; nobody can write it from the browser', async () => {
  await assertSucceeds(getDoc(doc(as('carol'), 'mailLog/welcome_x')));
  await assertFails(getDoc(doc(as('alice'), 'mailLog/welcome_x')));
  await assertFails(setDoc(doc(as('carol'), 'mailLog/welcome_x'), { to: 'a@b.ca' }));
});
