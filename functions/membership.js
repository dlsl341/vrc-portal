// Program registrations – pure helpers shared by the Cloud Functions and the tests.
// A season runs from the season start (default 1 October) to the day before the next one: "2026/27".
export const SEASON_START = '10-01';
export function seasonOf(date, start = SEASON_START) {
  const y = +date.slice(0, 4), y0 = date.slice(5) >= start ? y : y - 1;
  return `${y0}/${String((y0 + 1) % 100).padStart(2, '0')}`;
}
export function seasonRange(label, start = SEASON_START) {
  const y0 = +label.slice(0, 4), from = `${y0}-${start}`;
  const to = new Date(Date.parse(`${y0 + 1}-${start}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  return { from, to };
}
// The last day a registration lets you book: the earliest of its end, its paid-through date and an early end.
export function effectiveEnd(r) {
  return [r.end, r.paidThrough, r.endedOn].filter(Boolean).sort()[0] || r.end || '';
}
// Summary written onto members/{id}: what everyone else (and the security rules) can see.
export function summarize(regs, today) {
  const live = regs.filter(r => r.status !== 'cancelled').map(r => ({ program: r.program, season: r.season, from: r.start, to: effectiveEnd(r), end: r.end || null, paidThrough: r.paidThrough || null, ended: !!r.endedOn }))
    .filter(r => r.from && r.to && r.to >= r.from);
  const current = live.filter(r => r.from <= today && today <= r.to);
  const usable = live.filter(r => r.to >= today);           // now or later
  return {
    regs: live.sort((a, b) => b.from.localeCompare(a.from)),
    programs: [...new Set(current.map(r => r.program))],
    bookableFrom: usable.length ? usable.map(r => r.from).sort()[0] : '',
    bookableUntil: usable.length ? usable.map(r => r.to).sort().slice(-1)[0] : '',
  };
}
