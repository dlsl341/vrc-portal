// Pure helpers for the Concept2 Logbook import – no dependencies, so they can be unit-tested.
// Concept2 result fields: distance (metres), time (tenths of a second), type (rower, skierg, bike,
// dynamic, slides, paddle, water, snow, rollerski, multierg), date ("yyyy-mm-dd hh:mm:ss", end time),
// workout_type, stroke_rate, heart_rate {average}, calories_total, comments.
export const MACHINES = {
  rower: 'RowErg', dynamic: 'Dynamic RowErg', slides: 'RowErg on slides', skierg: 'SkiErg',
  bike: 'BikeErg', multierg: 'MultiErg', water: 'On water', paddle: 'Paddle', snow: 'Snow', rollerski: 'Rollerski'
};
const pad = n => String(n).padStart(2, '0');
export function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function workoutLabel(r) {
  const wt = String(r.workout_type || ''), dist = +r.distance || 0, sec = (+r.time || 0) / 10;
  let w = '';
  if (/^JustRow/i.test(wt)) w = 'Just row';
  else if (/Interval/i.test(wt)) w = 'Intervals';
  else if (/Distance/i.test(wt)) w = dist >= 1000 && dist % 1000 === 0 ? `${dist / 1000}k` : `${dist}m`;
  else if (/Time/i.test(wt)) w = fmtTime(sec);
  const mach = MACHINES[r.type] && r.type !== 'rower' && r.type !== 'water' ? MACHINES[r.type] : '';
  return [mach, w].filter(Boolean).join(' · ');
}
// Concept2 result → portal results document (without likes/at, which the caller manages).
export function mapResult(r, { memberId, uid, program }) {
  const dist = +r.distance || 0, tenths = +r.time || 0;
  if (!r || !r.id || dist <= 0 || tenths <= 0) return null;
  const hr = r.heart_rate && +r.heart_rate.average;
  return {
    memberId, by: uid, program: program || 'Other',
    date: String(r.date || '').slice(0, 10),
    type: r.type === 'water' || r.type === 'paddle' ? 'water' : 'erg',
    machine: r.type || null,
    workout: workoutLabel(r),
    km: Math.round(dist) / 1000,
    timeSec: Math.round(tenths) / 10,
    spm: +r.stroke_rate || null,
    hr: hr || null,
    cals: +r.calories_total || null,
    watts: null,
    notes: String(r.comments || '').slice(0, 500),
    source: 'concept2',
    c2Id: String(r.id),
    sessionId: null, bookingId: null
  };
}
// Find the result id / user id / event type in a webhook body, whatever its exact wrapping.
export function parseWebhook(body) {
  const b = typeof body === 'string' ? safeJson(body) : (body || {});
  const r = b.result || (b.data && (b.data.result || b.data)) || b;
  const type = String(b.type || b.event || b.event_type || (b.data && b.data.type) || '');
  const id = r.id || b.result_id || (b.data && b.data.result_id) || r.result_id || null;
  const userId = r.user_id || b.user_id || (b.data && b.data.user_id) || null;
  return { type, id: id ? String(id) : null, userId: userId ? String(userId) : null, deleted: /delete/i.test(type) };
}
function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
