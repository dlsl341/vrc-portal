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
