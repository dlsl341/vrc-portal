import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapResult, workoutLabel, parseWebhook } from '../functions/c2map.js';
const who = { memberId: 'm_k', uid: 'u1', program: 'Masters' };
test('maps a 2k RowErg piece', () => {
  const r = mapResult({ id: 123, type: 'rower', date: '2026-11-17 19:42:10', distance: 2000, time: 4523, workout_type: 'FixedDistanceSplits', stroke_rate: 30, heart_rate: { average: 171 }, calories_total: 140, comments: 'PB!' }, who);
  assert.equal(r.km, 2); assert.equal(r.timeSec, 452.3); assert.equal(r.date, '2026-11-17'); assert.equal(r.type, 'erg');
  assert.equal(r.workout, '2k'); assert.equal(r.spm, 30); assert.equal(r.hr, 171); assert.equal(r.cals, 140);
  assert.equal(r.program, 'Masters'); assert.equal(r.c2Id, '123'); assert.equal(r.by, 'u1'); assert.equal(r.source, 'concept2');
});
test('labels other machines and time pieces', () => {
  assert.equal(workoutLabel({ type: 'skierg', workout_type: 'FixedTimeSplits', time: 18000 }), 'SkiErg · 30:00');
  assert.equal(workoutLabel({ type: 'rower', workout_type: 'JustRow' }), 'Just row');
  assert.equal(workoutLabel({ type: 'rower', workout_type: 'FixedDistanceInterval', distance: 4000 }), 'Intervals');
  assert.equal(workoutLabel({ type: 'rower', workout_type: 'FixedDistanceSplits', distance: 5500 }), '5500m');
});
test('on-water results become water; empty results are skipped', () => {
  assert.equal(mapResult({ id: 1, type: 'water', date: '2026-11-01 08:00:00', distance: 12000, time: 36000 }, who).type, 'water');
  assert.equal(mapResult({ id: 2, type: 'rower', distance: 0, time: 100 }, who), null);
});
test('webhook bodies in different shapes', () => {
  assert.deepEqual(parseWebhook({ type: 'result-added', result: { id: 9, user_id: 77 } }), { type: 'result-added', id: '9', userId: '77', deleted: false });
  assert.deepEqual(parseWebhook({ data: { type: 'result-deleted', result_id: 9 } }), { type: 'result-deleted', id: '9', userId: null, deleted: true });
  assert.equal(parseWebhook('{"type":"result-updated","result":{"id":5,"user_id":3}}').id, '5');
});
