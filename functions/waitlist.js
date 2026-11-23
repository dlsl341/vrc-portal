// Erg waitlist – pure helpers shared by the Cloud Function and its tests.
// Mirrors the portal's erg blocks (index.html: ERG_GROUPS_DEFAULT / ergGroups / ergOpenTime).

export const ERG_GROUPS_DEFAULT = 'Masters 1-12; Intermediate 13-17; Para 18 only';
export const BC_OFFSET = '-07:00';   // BC is on permanent UTC-7

export function ergGroupsText(sid, session = {}) {
  if (session.ergGroups != null) return session.ergGroups;
  return /^masters-.*-erg(-2)?$/.test(sid) ? ERG_GROUPS_DEFAULT : '';
}
export function parseErgGroups(text) {
  return String(text || '').split(/[;\n]/).map(x => x.trim()).filter(Boolean).map(x => {
    const m = x.match(/^(.+?)\s+(\d+)\s*(?:[-–]\s*(\d+))?(\s+only)?$/i);
    return m ? { name: m[1].trim(), from: +m[2], to: +(m[3] || m[2]), only: !!m[4] } : null;
  }).filter(Boolean);
}
export const groupOf = (groups, n) => groups.find(g => n >= g.from && n <= g.to) || null;

// A Date for "HH:MM" on "YYYY-MM-DD" in BC time.
export const bcTime = (date, hhmm) => new Date(`${date}T${hhmm || '00:00'}:00${BC_OFFSET}`);

// Who gets a freed erg?
//   entries: waitlist docs for this session date [{memberId, group, t}]
//   booked:  Set of member ids already in the session
//   overflow: true once reserved ergs have opened to everyone (noon on the day)
// Before overflow only people waiting for the erg's own group qualify. After overflow anyone
// waiting qualifies (own group first), except for an "only" block (e.g. Para 18).
export function pickPromotion({ groups, erg, entries, booked, overflow }) {
  const g = groupOf(groups, erg);
  const line = entries.filter(e => !booked.has(e.memberId)).sort((a, b) => (a.t || 0) - (b.t || 0));
  const same = e => g && String(e.group).toLowerCase() === g.name.toLowerCase();
  const first = line.find(same);
  if (first) return first;
  if (!g) return line[0] || null;                // an unreserved erg: first in any line
  if (g.only || !overflow) return null;
  return line[0] || null;
}
