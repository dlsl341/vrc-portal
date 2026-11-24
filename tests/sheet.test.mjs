import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTabs, nextDate, tabName, sheetIdFrom, explainSheetError } from '../functions/sheet.js';

const now = Date.parse('2026-11-23T09:00:00-07:00');           // Monday morning in Vancouver
const data = {
  programs: { masters: { name: 'Masters' } },
  sessions: {
    'masters-mon-erg': { title: 'Masters · Mon erg', weekday: 0, start: '17:30', end: '18:15', programId: 'masters', type: 'erg', capacity: 18 },
    'masters-mon-erg-2': { title: 'Masters · Mon erg (wave 2)', weekday: 0, start: '18:15', end: '19:00', programId: 'masters', type: 'erg', capacity: 18 },
    'masters-sat-am': { title: 'Masters · Sat AM', weekday: 5, start: '09:00', end: '11:45', programId: 'masters', type: 'water', capacity: 3, coach: 'Andrew' },
    'old': { title: 'Old', weekday: 2, start: '18:00', programId: 'masters', type: 'water', active: false },
  },
  members: { a: { displayName: 'Jan K' }, b: { displayName: 'Kerri F' }, c: { displayName: 'Cox C' } },
  boats: { b1: { name: 'Rio 2016', currentRig: '2x', status: 'available' } },
  bookings: {
    x: { sessionId: 'masters-mon-erg', date: '2026-11-23', erg: 2, crew: ['a'], at: '2026-11-20T02:00:00Z' },
    gone: { sessionId: 'masters-mon-erg', date: '2026-11-23', erg: 3, crew: [null], at: '2026-11-20T02:00:00Z' },
    y: { sessionId: 'masters-sat-am', date: '2026-11-28', boatId: 'b1', rig: '2x', crew: ['a', 'b'], cox: 'c', pcoc: true, at: '2026-11-22T17:00:00Z' },
  },
  waitlist: { w: { sessionId: 'masters-mon-erg', date: '2026-11-23', memberId: 'b', group: 'Masters', t: 5, at: '2026-11-21T00:00:00Z' } },
  occurrences: { 'masters-sat-am_20261128': { cancelled: true, reason: 'Wind' } },
};

test('next date: today until the session ends, then next week', () => {
  const s = data.sessions['masters-mon-erg'];
  assert.equal(nextDate(s, now), '2026-11-23');
  assert.equal(nextDate(s, Date.parse('2026-11-23T18:20:00-07:00')), '2026-11-30');
  assert.equal(nextDate(data.sessions['masters-sat-am'], now), '2026-11-28');
});

test('tab names follow the old sheet', () => {
  assert.equal(tabName(data.sessions['masters-mon-erg'], 'Masters'), 'Mon - Masters ERG');
  assert.equal(tabName(data.sessions['masters-sat-am'], 'Masters'), 'Sat AM - Masters');
});

test('both erg waves share one tab; erg rows, groups and waitlist are filled in', () => {
  const tabs = buildTabs(data, now, 'https://x');
  assert.deepEqual(tabs.map(t => t.title), ['Mon - Masters ERG', 'Sat AM - Masters', 'Boat Status']);
  const erg = tabs[0].rows;
  assert.match(erg[0][0], /Monday, Nov 23, 2026/);
  const r2 = erg.find(r => r[0] === 'ERG 2');
  assert.deepEqual(r2.slice(0, 3), ['ERG 2', 'Jan K', 'Masters']);
  assert.equal(erg.find(r => r[0] === 'ERG 3')[1], '');          // emptied booking shows as free
  assert.equal(erg.find(r => r[0] === 'ERG 18')[2], 'Para only');
  assert.ok(erg.some(r => r[0] === 'Waitlist – Masters'));
  assert.ok(erg.some(r => r[0] === 1 && r[1] === 'Kerri F'));
  assert.equal(erg.filter(r => /^#$/.test(r[0])).length, 2);    // two wave headers
});

test('on-water tab shows crew, boat, PCOC and a cancellation', () => {
  const rows = buildTabs(data, now, 'https://x')[1].rows;
  assert.ok(rows.some(r => /CANCELLED – Wind/.test(r[1] || '')));
  const b = rows.find(r => r[0] === 1);
  assert.deepEqual(b.slice(1, 6), ['Jan K, Kerri F · cox Cox C', '2x Rio 2016', '', 'TRUE', 'FALSE']);
  assert.equal(rows.filter(r => typeof r[0] === 'number').length, 3);  // capacity 3
});

test('sheet links and errors', () => {
  assert.equal(sheetIdFrom('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0'), '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
  assert.equal(sheetIdFrom('nope'), null);
  assert.match(explainSheetError(403, 'The caller does not have permission'), /Share it/);
  assert.match(explainSheetError(403, 'Google Sheets API has not been used in project'), /API is turned off/);
});
