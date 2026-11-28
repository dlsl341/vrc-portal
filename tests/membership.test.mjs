import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, seasonRange, effectiveEnd, summarize } from '../functions/membership.js';

test('seasons start on 1 October', () => {
  assert.equal(seasonOf('2026-10-01'), '2026/27');
  assert.equal(seasonOf('2026-09-30'), '2025/26');
  assert.equal(seasonOf('2027-03-15'), '2026/27');
  assert.deepEqual(seasonRange('2026/27'), { from: '2026-10-01', to: '2027-09-30' });
});

test('booking stops at the earliest of end, paid-through and early end', () => {
  assert.equal(effectiveEnd({ end: '2027-09-30' }), '2027-09-30');
  assert.equal(effectiveEnd({ end: '2027-09-30', paidThrough: '2026-12-31' }), '2026-12-31');
  assert.equal(effectiveEnd({ end: '2027-09-30', paidThrough: '2027-03-31', endedOn: '2027-01-15' }), '2027-01-15');
});

test('member summary: current programs and bookable window', () => {
  const regs = [{ program: 'Masters', season: '2026/27', start: '2026-10-01', end: '2027-09-30', paidThrough: '2026-12-31' },
    { program: 'Rec', season: '2025/26', start: '2025-10-01', end: '2026-09-30' }];
  const s = summarize(regs, '2026-11-27');
  assert.deepEqual(s.programs, ['Masters']);
  assert.equal(s.bookableFrom, '2026-10-01');
  assert.equal(s.bookableUntil, '2026-12-31');
  const lapsed = summarize(regs, '2027-01-05');
  assert.deepEqual(lapsed.programs, []);
  assert.equal(lapsed.bookableUntil, '');
  assert.equal(lapsed.regs.length, 2);          // history kept
});
