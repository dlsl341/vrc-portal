// No-show / late-cancel fees – pure helpers (no I/O) shared by the Cloud Functions and tests.
//
// Rules per program (feeRules/{programId}): { enabled, noShowFee, lateFee, lateHours, closeMin }
//   • Late cancel: a member removes themselves from a booking less than `lateHours` before the start.
//     The fee waits ("pending") until class time and is waived if someone new signed up after them.
//   • No-show: booked but not checked in Present/Late by the coach when class closes
//     (`closeMin` minutes after the start). If no attendance was taken, nobody is charged.
import { bcTime } from './waitlist.js';

export const FEE_DEFAULTS = { lateHours: 12, closeMin: 10, noShowFee: 0, lateFee: 0 };
const BC_MS = 7 * 3600e3;
export const bcToday = now => new Date(now - BC_MS).toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const dow = d => (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;         // 0 = Monday
export const money = n => '$' + (Math.round((+n || 0) * 100) / 100).toFixed(2);

export function ruleOf(rules, programId) {
  const r = rules && rules[programId];
  if (!r || !r.enabled) return null;
  const n = (v, d) => (v === '' || v == null || isNaN(+v) ? d : +v);
  return { noShowFee: n(r.noShowFee, 0), lateFee: n(r.lateFee, 0), lateHours: n(r.lateHours, FEE_DEFAULTS.lateHours), closeMin: n(r.closeMin, FEE_DEFAULTS.closeMin) };
}
export const startMs = (date, s) => bcTime(date, s.start || '00:00').getTime();
export const closeMs = (date, s, rule) => startMs(date, s) + rule.closeMin * 60e3;

// Is a cancellation at `now` a late one? → hours before the start (rounded down to 0.1) or null
export function lateCancel(rule, date, s, now) {
  if (!rule || !(rule.lateFee > 0) || !s.start) return null;
  const st = startMs(date, s);
  if (now >= closeMs(date, s, rule) || now < st - rule.lateHours * 3600e3) return null;
  return Math.max(0, Math.floor((st - now) / 360e3) / 10);
}

// Who was a no-show? booked people with no Present/Late mark. null = attendance not taken.
export function noShows(people, attendance) {
  if (!attendance) return null;
  const marks = attendance.marks || {};
  return people.filter(m => marks[m] !== 'present' && marks[m] !== 'late');
}

// Late cancels in a session are waived when someone new took a place. Each newcomer (booked now,
// not booked when that person cancelled) covers one late cancel, earliest cancel first.
// pendings: [{id, at, snapshot: [memberIds booked right after the cancel]}]; booked: memberIds now.
export function resolveLate(pendings, booked) {
  const used = new Set(pendings.map(p => p.memberId)), out = [];   // people who cancelled don't “fill” a spot
  for (const p of [...pendings].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    if (booked.includes(p.memberId)) { out.push({ id: p.id, status: 'waived', rebooked: true }); continue; }   // they came back
    const snap = new Set(p.snapshot || []);
    const by = booked.find(m => !snap.has(m) && !used.has(m));
    if (by) { used.add(by); out.push({ id: p.id, status: 'waived', filledBy: by }); }
    else out.push({ id: p.id, status: 'charged' });
  }
  return out;
}

// Monday–Sunday of the BC week containing `now`
export function weekOf(now) { const t = bcToday(now); const mon = addDays(t, -dow(t)); return { from: mon, to: addDays(mon, 6) }; }

const TYPE = { noshow: 'No-show', late: 'Late cancel' };
const STATUS = { charged: 'Charged', waived: 'Waived', pending: 'Pending' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };

// fees: [{memberName, program, sessionTitle, date, start, type, amount, status, hoursBefore, waiveNote}]
// missing: [{program, sessionTitle, date, booked}] – classes with fees on where attendance wasn't taken
export function weeklyReport({ fees, missing = [], from, to }) {
  const rows = [...fees].sort((a, b) => (a.date + a.start + a.memberName).localeCompare(b.date + b.start + b.memberName));
  const charged = rows.filter(f => f.status === 'charged');
  const total = charged.reduce((a, f) => a + (+f.amount || 0), 0);
  const byProg = {};
  charged.forEach(f => { const p = byProg[f.program] ||= { n: 0, sum: 0 }; p.n++; p.sum += +f.amount || 0; });
  const summary = Object.entries(byProg).sort().map(([p, v]) => `${p}: ${v.n} fee${v.n === 1 ? '' : 's'}, ${money(v.sum)}`);
  const header = ['Date', 'Time', 'Member', 'Program', 'Session', 'Type', 'Amount', 'Status', 'Detail'];
  const detail = f => f.type === 'late' ? `cancelled ${f.hoursBefore != null ? f.hoursBefore + ' h' : ''} before start` : 'not checked in';
  const cells = f => [f.date, f.start || '', f.memberName, f.program, f.sessionTitle, TYPE[f.type] || f.type, money(f.amount), STATUS[f.status] || f.status,
    (detail(f) + (f.waiveNote ? ' · ' + f.waiveNote : '')).trim()];
  const csv = [header, ...rows.map(cells)].map(r => r.map(csvCell).join(',')).join('\n') + '\n';
  const table = rows.length ? `<table style="border-collapse:collapse;font-size:13px;width:100%"><tr>${header.map(h => `<th style="text-align:left;border-bottom:2px solid #231f20;padding:4px 6px">${h}</th>`).join('')}</tr>
${rows.map(f => `<tr${f.status !== 'charged' ? ' style="color:#888"' : ''}>${cells(f).map(c => `<td style="border-bottom:1px solid #eee;padding:4px 6px">${esc(c)}</td>`).join('')}</tr>`).join('\n')}</table>`
    : '<p>No no-show or late-cancel fees this week. 🎉</p>';
  const miss = missing.length ? `<p style="margin-top:16px"><b>Attendance not taken</b> (no no-show fees could be applied):</p><ul>${missing.map(m => `<li>${esc(m.date)} · ${esc(m.sessionTitle)} (${esc(m.program)}) – ${m.booked} booked</li>`).join('')}</ul>` : '';
  const html = `<p><b>${charged.length} fee${charged.length === 1 ? '' : 's'} charged · ${money(total)}</b>${summary.length ? '<br>' + summary.map(esc).join('<br>') : ''}</p>${table}${miss}
<p style="color:#666;font-size:12px">Waived and pending fees are shown in grey and not included in the total. A spreadsheet copy (CSV) is attached. Waive a fee on the Admin page.</p>`;
  const text = `${charged.length} fees charged, ${money(total)}\n${summary.join('\n')}\n\n` + rows.map(f => cells(f).join(' | ')).join('\n') +
    (missing.length ? '\n\nAttendance not taken:\n' + missing.map(m => `${m.date} ${m.sessionTitle} (${m.program}) – ${m.booked} booked`).join('\n') : '');
  return { total, count: charged.length, html, text, csv, title: `No-show & late-cancel fees · ${from} to ${to}` };
}
