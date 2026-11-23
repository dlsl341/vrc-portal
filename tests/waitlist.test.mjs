import test from 'node:test';
import assert from 'node:assert/strict';
import { ergGroupsText, parseErgGroups, pickPromotion, bcTime } from '../functions/waitlist.js';

const groups = parseErgGroups(ergGroupsText('masters-tue-erg'));
const line = [
  { memberId: 'int1', group: 'Intermediate', t: 1 },
  { memberId: 'm1', group: 'Masters', t: 2 },
  { memberId: 'm2', group: 'Masters', t: 3 },
];

test('default erg blocks apply to masters erg sessions', () => {
  assert.deepEqual(groups.map(g => [g.name, g.from, g.to, g.only]), [['Masters', 1, 12, false], ['Intermediate', 13, 17, false], ['Para', 18, 18, true]]);
  assert.equal(ergGroupsText('rec-sun'), '');
});

test('a freed Masters erg goes to the first Masters member waiting', () => {
  assert.equal(pickPromotion({ groups, erg: 5, entries: line, booked: new Set(), overflow: false }).memberId, 'm1');
  assert.equal(pickPromotion({ groups, erg: 5, entries: line, booked: new Set(['m1']), overflow: false }).memberId, 'm2');
});

test('a freed Intermediate erg goes to Intermediate, never to Masters before noon', () => {
  assert.equal(pickPromotion({ groups, erg: 14, entries: line, booked: new Set(), overflow: false }).memberId, 'int1');
  assert.equal(pickPromotion({ groups, erg: 14, entries: line.slice(1), booked: new Set(), overflow: false }), null);
});

test('after noon anyone waiting can take it, except the Para-only erg', () => {
  assert.equal(pickPromotion({ groups, erg: 14, entries: line.slice(1), booked: new Set(), overflow: true }).memberId, 'm1');
  assert.equal(pickPromotion({ groups, erg: 18, entries: line, booked: new Set(), overflow: true }), null);
});

test('session times are read in BC time (UTC-7)', () => {
  assert.equal(bcTime('2026-11-24', '18:30').toISOString(), '2026-11-25T01:30:00.000Z');
});
