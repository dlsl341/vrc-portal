import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftIcs, shiftChanges } from '../functions/ics.js';

test('shift invite: BC times in UTC, stable uid, sequence bumps update the same event', () => {
  const ics = shiftIcs({ uid: 'shift-nico-s1@vrc', sequence: 2, date: '2027-06-04', start: '17:00', end: '19:00', summary: 'Load trailer, Nicomekl', location: 'VRC, Coal Harbour' });
  assert.match(ics, /DTSTART:20270605T000000Z/);
  assert.match(ics, /DTEND:20270605T020000Z/);
  assert.match(ics, /UID:shift-nico-s1@vrc/);
  assert.match(ics, /SEQUENCE:2/);
  assert.match(ics, /LOCATION:VRC\\, Coal Harbour/);
  assert.match(shiftIcs({ uid: 'x', method: 'CANCEL', date: '2027-06-04', start: '17:00' }), /METHOD:CANCEL[\s\S]*STATUS:CANCELLED/);
});

test('time changes and removed shifts are detected', () => {
  const a = [{ id: 's1', date: '2027-06-04', start: '17:00', end: '19:00' }, { id: 's2', date: '2027-06-05', start: '06:00' }];
  const b = [{ id: 's1', date: '2027-06-04', start: '16:30', end: '19:00' }];
  const c = shiftChanges(a, b);
  assert.deepEqual(c.changed.map(s => s.id), ['s1']);
  assert.deepEqual(c.removed.map(s => s.id), ['s2']);
});
