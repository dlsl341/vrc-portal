// Google Sheet copy of the sign-out sheets – pure layout code (no I/O), shared by the Cloud Function
// and tests. One tab per weekly slot, laid out like the old 2026_Boat_Sign_Out sheet, showing the next
// upcoming date. The sheet is READ-ONLY for members: the portal rewrites these tabs on every change.
import { ergGroupsText, parseErgGroups, groupOf, bcTime } from './waitlist.js';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BC_MS = 7 * 3600e3;                                     // BC = UTC-7 all year

export const bcToday = now => new Date(now - BC_MS).toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dow = d => (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;   // 0 = Monday
export function bcStamp(iso) {
  if (!iso) return '';
  const t = Date.parse(iso); if (isNaN(t)) return '';
  return new Date(t - BC_MS).toISOString().slice(0, 16).replace('T', ' ');
}
export function dateLong(d) { const [y, m, dd] = d.split('-').map(Number); return `${DAY_LONG[dow(d)]}, ${MONTHS[m - 1]} ${dd}, ${y}`; }
const hm = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const range = s => s.start ? `${hm(s.start)}${s.end ? ' – ' + hm(s.end) : ''}` : '';

// The next date this weekly session happens: today until it has finished, otherwise next week.
export function nextDate(s, now) {
  const t = bcToday(now);
  let d = addDays(t, ((s.weekday ?? 0) - dow(t) + 7) % 7);
  if (d === t && now >= bcTime(d, s.end || s.start || '23:59').getTime()) d = addDays(d, 7);
  return d;
}
export function tabName(s, progName) {
  const day = DAYS[s.weekday ?? 0];
  if (s.type === 'erg') return `${day} - ${progName} ERG`;
  if (!s.start) return `${day} - ${progName}`;
  return `${day} ${s.start < '12:00' ? 'AM' : 'PM'} - ${progName}`;
}
const people = b => [...(b.crew || []), b.cox].filter(Boolean);

// data: { sessions, programs, members, boats, bookings, occurrences, waitlist } as {id: doc}; now in ms.
// Returns [{ title, rows: [[cell…]], bold: [row indexes], order }]
export function buildTabs(data, now, site) {
  const { sessions = {}, programs = {}, members = {}, boats = {}, bookings = {}, occurrences = {}, waitlist = {} } = data;
  const name = id => (members[id] && members[id].displayName) || '(unknown)';
  const groups = new Map();
  for (const [sid, s] of Object.entries(sessions)) {
    if (s.active === false) continue;
    const p = programs[s.programId] || {};
    const title = tabName(s, p.name || s.programId || 'Program');
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push([sid, s]);
  }
  const updated = `Updated ${bcStamp(new Date(now).toISOString())} (Vancouver time)`;
  const tabs = [];
  for (const [title, list] of groups) {
    list.sort((a, b) => String(a[1].start).localeCompare(String(b[1].start)));
    const first = list[0][1], d0 = nextDate(first, now), o0 = occurrences[list[0][0] + '_' + d0.replace(/-/g, '')] || {};
    const rows = [], bold = [];
    rows.push([dateLong(d0), '', '', 'READ-ONLY COPY – book, cancel and join waitlists in the portal:', site]); bold.push(0);
    rows.push([updated]);
    rows.push(['', 'Coach: ' + (o0.coach || first.coach || '')]);
    rows.push([]);
    for (const [sid, s] of list) {
      const d = nextDate(s, now), ymd = d.replace(/-/g, ''), o = occurrences[sid + '_' + ymd] || {};
      const bk = Object.values(bookings).filter(b => b.sessionId === sid && b.date === d && people(b).length);
      const cap = o.capacity || s.capacity || 0;
      const head = `${(s.title || '').toUpperCase()}${d !== d0 ? ' – ' + dateLong(d) : ''}${range(s) ? ' · ' + range(s) : ''}`;
      if (o.cancelled) { rows.push(['', `CANCELLED${o.reason || o.reasonCode ? ' – ' + (o.reason || o.reasonCode) : ''}${o.cancelNotes ? '. ' + o.cancelNotes : ''}`]); bold.push(rows.length - 1); }
      if (s.type === 'erg') {
        const eg = parseErgGroups(ergGroupsText(sid, s));
        bold.push(rows.length); rows.push(['#', head, 'Reserved for', 'Notes', 'Timestamp']);
        const byN = {}, extra = [];
        bk.sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach(b => { if (b.erg && !byN[b.erg]) byN[b.erg] = b; else extra.push(b); });
        const n = Math.max(cap, ...Object.keys(byN).map(Number), 0) || 18;
        for (let i = 1; i <= n; i++) {
          const b = byN[i], g = groupOf(eg, i);
          rows.push([`ERG ${i}`, b ? people(b).map(name).join(', ') : '', g ? (g.only ? g.name + ' only' : g.name) : '', b ? (b.notes || '') : '', b ? bcStamp(b.at) : '']);
        }
        extra.forEach(b => rows.push(['ERG ' + (b.erg || '?'), people(b).map(name).join(', '), '', b.notes || '', bcStamp(b.at)]));
        const waits = Object.values(waitlist).filter(w => w.sessionId === sid && w.date === d && !bk.some(b => people(b).includes(w.memberId)));
        const gnames = [...new Set(waits.map(w => w.group))];
        for (const gname of gnames) {
          const line = waits.filter(w => w.group === gname).sort((a, b) => (a.t || 0) - (b.t || 0));
          bold.push(rows.length); rows.push([`Waitlist – ${gname}`]);
          line.forEach((w, i) => rows.push([i + 1, name(w.memberId), gname, '', bcStamp(w.at)]));
        }
      } else {
        bold.push(rows.length); rows.push(['#', head, 'Boat', 'Crew Mix', 'PCOC', 'Open to Crew', 'Timestamp', 'Notes']);
        bk.sort((a, b) => String(a.at).localeCompare(String(b.at)));
        const n = Math.max(cap, bk.length);
        for (let i = 0; i < n; i++) {
          const b = bk[i];
          if (!b) { rows.push([i + 1]); continue; }
          const boat = boats[b.boatId];
          const crew = (b.crew || []).map(x => x ? name(x) : 'open seat').join(', ') + (b.cox ? ' · cox ' + name(b.cox) : '');
          rows.push([i + 1, crew, boat ? `${b.rig || boat.currentRig || ''} ${boat.name}`.trim() : 'Coach to assign', b.crewMix || '', b.pcoc ? 'TRUE' : 'FALSE', b.open ? 'TRUE' : 'FALSE', bcStamp(b.at), b.notes || '']);
        }
      }
      rows.push([]);
    }
    tabs.push({ title, rows, bold, order: [(list[0][1].weekday ?? 0), String(first.start || '')] });
  }
  tabs.sort((a, b) => a.order[0] - b.order[0] || a.order[1].localeCompare(b.order[1]));
  // Boat status, like the old "Boat Status" tab
  const STATUS = { available: 'Available', dnr: 'Do Not Row', repair: 'Long-Term Repair', retired: 'Retired' };
  const brows = [['Boat', 'Current rig', 'Rigs', 'Seats', 'Status', 'Note'], [updated]];
  Object.values(boats).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .forEach(b => brows.push([b.name || '', b.currentRig || '', (b.rigs || []).join(' '), b.seats || '', STATUS[b.status] || b.status || '', b.statusNote || '']));
  tabs.push({ title: 'Boat Status', rows: brows, bold: [0] });
  return tabs;
}

// "https://docs.google.com/spreadsheets/d/<id>/edit…" or a bare id → id
export function sheetIdFrom(s) {
  const m = String(s || '').match(/\/d\/([a-zA-Z0-9_-]{20,})/) || String(s || '').match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}
// Plain-language reasons for the Admin page
export function explainSheetError(status, text) {
  const t = String(text || '');
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(t)) return 'The Google Sheets API is turned off for the project. Turn it on (Admin page → Google Sheet copy → step 3), then press Sync now.';
  if (status === 403) return 'The portal is not allowed to edit this sheet. Share it with the portal’s robot email as an Editor, then press Sync now.';
  if (status === 404) return 'Sheet not found. Check the link you pasted.';
  return `Google said: ${status} ${t.slice(0, 200)}`;
}
