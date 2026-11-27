// Calendar invites (.ics) for regatta shifts. Times are BC local (UTC-7 all year since Nov 2026).
const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const bc = (date, hm) => new Date(`${date}T${hm || '00:00'}:00-07:00`);
const fold = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// method: REQUEST (new / updated – same uid + higher sequence updates the event) or CANCEL
export function shiftIcs({ uid, sequence = 0, method = 'REQUEST', date, start, end, summary, location, description, organizer, attendee }) {
  const s = bc(date, start), e = end ? bc(date, end) : new Date(s.getTime() + 3600e3);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VRC//Rowers portal//EN', 'CALSCALE:GREGORIAN', `METHOD:${method}`, 'BEGIN:VEVENT',
    `UID:${uid}`, `SEQUENCE:${sequence}`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(s)}`, `DTEND:${stamp(e)}`,
    `SUMMARY:${fold(summary)}`, location ? `LOCATION:${fold(location)}` : '', description ? `DESCRIPTION:${fold(description)}` : '',
    organizer ? `ORGANIZER;CN=VRC Rowers portal:mailto:${organizer}` : '', attendee ? `ATTENDEE;RSVP=FALSE;PARTSTAT=ACCEPTED:mailto:${attendee}` : '',
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}
export const SHIFT_KINDS = { loadVRC: 'Load the trailer at VRC', unloadVenue: 'Unload at the venue', loadVenue: 'Load at the venue', unloadVRC: 'Unload at VRC', rigging: 'Rigging help', driver: 'Trailer driver', helper: 'Spectator helper', other: 'Other' };
// Which shifts changed time or place between two versions of a regatta's shift list
export function shiftChanges(before = [], after = []) {
  const b = Object.fromEntries(before.map(s => [s.id, s])), out = { changed: [], removed: [] };
  for (const s of after) { const o = b[s.id]; if (o && (o.date !== s.date || o.start !== s.start || o.end !== s.end || (o.place || '') !== (s.place || ''))) out.changed.push(s); }
  const ids = new Set(after.map(s => s.id));
  for (const s of before) if (!ids.has(s.id)) out.removed.push(s);
  return out;
}
