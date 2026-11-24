import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleOf, lateCancel, noShows, resolveLate, weekOf, weeklyReport } from '../functions/fees.js';
import { feeEmail, feeReportEmail } from '../functions/mail.js';

const rule = ruleOf({ masters: { enabled: true, noShowFee: 15, lateFee: '10', lateHours: 12, closeMin: '' } }, 'masters');
const s = { start: '18:00', end: '19:00' };
const at = iso => Date.parse(iso);

test('rules: off programs have no rule; blanks fall back to defaults', () => {
  assert.equal(ruleOf({ masters: { enabled: false, lateFee: 5 } }, 'masters'), null);
  assert.deepEqual(rule, { noShowFee: 15, lateFee: 10, lateHours: 12, closeMin: 10 });
});

test('late cancel window: within 12 h of the start (Vancouver time)', () => {
  assert.equal(lateCancel(rule, '2026-11-24', s, at('2026-11-24T05:59:00-07:00')), null);   // 12h01 before
  assert.equal(lateCancel(rule, '2026-11-24', s, at('2026-11-24T15:00:00-07:00')), 3);
  assert.equal(lateCancel(rule, '2026-11-24', s, at('2026-11-24T18:11:00-07:00')), null);   // after class closed
  assert.equal(lateCancel({ ...rule, lateFee: 0 }, '2026-11-24', s, at('2026-11-24T15:00:00-07:00')), null);
});

test('no-shows come from the coach check-in only', () => {
  assert.equal(noShows(['a', 'b'], null), null);
  assert.deepEqual(noShows(['a', 'b', 'c'], { marks: { a: 'present', b: 'late', c: 'absent' } }), ['c']);
  assert.deepEqual(noShows(['a', 'd'], { marks: { a: 'present' } }), ['d']);
});

test('late cancels are waived when someone new takes the place, earliest cancel first', () => {
  const p = [{ id: 'x', memberId: 'x', at: '1', snapshot: ['a'] }, { id: 'y', memberId: 'y', at: '2', snapshot: ['a'] }];
  assert.deepEqual(resolveLate(p, ['a', 'n1']).map(r => r.status), ['waived', 'charged']);
  assert.deepEqual(resolveLate(p, ['a']).map(r => r.status), ['charged', 'charged']);
  assert.deepEqual(resolveLate(p, ['a', 'y']).map(r => r.status), ['charged', 'waived']);    // y booked back in
});

test('weekly report: Monday–Sunday, totals only charged fees, CSV is safe', () => {
  assert.deepEqual(weekOf(at('2026-11-29T20:00:00-07:00')), { from: '2026-11-23', to: '2026-11-29' });
  const r = weeklyReport({ from: '2026-11-23', to: '2026-11-29', missing: [{ date: '2026-11-24', sessionTitle: 'Masters erg', program: 'Masters', booked: 9 }], fees: [
    { memberName: 'Jan K', program: 'Masters', sessionTitle: 'Masters erg', date: '2026-11-24', start: '18:00', type: 'noshow', amount: 15, status: 'charged' },
    { memberName: '=HACK()', program: 'Masters', sessionTitle: 'Masters erg', date: '2026-11-24', start: '18:00', type: 'late', amount: 10, status: 'waived', hoursBefore: 2 }] });
  assert.equal(r.total, 15); assert.equal(r.count, 1);
  assert.match(r.csv, /"'=HACK\(\)"/);
  assert.match(r.html, /Attendance not taken/);
  const m = feeReportEmail(r); assert.equal(m.attachments[0].contentType, 'text/csv'); assert.match(m.subject, /\$15\.00/);
});

test('member email explains the fee', () => {
  const m = feeEmail({ firstName: 'Jan', type: 'late', amount: 10, title: 'Masters erg', date: '2026-11-24', start: '18:00', hoursBefore: 3, lateHours: 12 });
  assert.match(m.subject, /late-cancellation fee/); assert.match(m.text, /\$10\.00/); assert.match(m.text, /3 hours/);
});
