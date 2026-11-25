// Member emails (welcome on approval, notice on decline). Pure templates + a tiny SMTP sender.
// Works with any provider that offers SMTP: Gmail (app password), Resend, SendGrid, Mailgun, Postmark…
// Settings (written to functions/.env at deploy from GitHub secrets):
//   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASS, MAIL_FROM ("VRC Rowing <portal@…>")
const SITE = 'https://vrc-rower-s-portal.web.app';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function frame(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f2ef;font-family:Arial,Helvetica,sans-serif;color:#231f20">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ef;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-top:6px solid #ea3c42;border-radius:6px">
<tr><td style="padding:28px 32px 8px"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c42a30;font-weight:bold">Vancouver Rowing Club</div>
<h1 style="font-family:Georgia,serif;font-size:24px;margin:8px 0 0">${esc(title)}</h1></td></tr>
<tr><td style="padding:12px 32px 28px;font-size:15px;line-height:1.55">${bodyHtml}</td></tr>
<tr><td style="padding:14px 32px;border-top:1px solid #eee;font-size:12px;color:#777">VRC Rowing Portal · <a href="${SITE}" style="color:#c42a30">${SITE.replace('https://', '')}</a></td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href, label) => `<p style="margin:22px 0"><a href="${href}" style="background:#ea3c42;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;

export function welcomeEmail({ firstName, memberName, programs = [] }) {
  const hi = firstName || (memberName || '').split(' ')[0] || 'there';
  const progs = programs.length ? ` You’re set up for <b>${esc(programs.join(', '))}</b>.` : '';
  const subject = 'You’re in – welcome to the VRC Rowing Portal';
  const html = frame('Welcome to the VRC Rowing Portal', `<p>Hi ${esc(hi)},</p>
<p>Good news – a club admin has approved your request and your portal account is now linked to your member profile${memberName ? ` (<b>${esc(memberName)}</b>)` : ''}.${progs}</p>
<p>You can now:</p><ul style="padding-left:20px;margin:0">
<li>Book sessions, boats and ergs – including open erg time</li><li>Join crews and add sessions to your calendar</li>
<li>Log your results (or connect your Concept2 Logbook) and cheer on clubmates</li><li>Report boat issues and help with maintenance</li></ul>
${button(SITE, 'Open the portal')}
<p style="color:#555">Tip: add the portal to your phone’s home screen for one-tap access. Sign in the same way you did before.</p>
<p>See you on the water!</p>`);
  const text = `Hi ${hi},\n\nA club admin has approved your request and your VRC Rowing Portal account is now linked to your member profile${memberName ? ` (${memberName})` : ''}.${programs.length ? ` You're set up for ${programs.join(', ')}.` : ''}\n\nYou can now book sessions, boats and ergs, join crews, log results (or connect Concept2) and report boat issues.\n\nOpen the portal: ${SITE}\n\nSee you on the water!\nVancouver Rowing Club`;
  return { subject, html, text };
}
export function declinedEmail({ firstName, reason }) {
  const hi = firstName || 'there';
  const subject = 'About your VRC Rowing Portal request';
  const html = frame('About your portal request', `<p>Hi ${esc(hi)},</p>
<p>A club admin wasn’t able to approve your request to link your account to a member profile.</p>
${reason ? `<p style="background:#f7f6f3;border-left:4px solid #ea3c42;padding:10px 14px"><b>Reason:</b> ${esc(reason)}</p>` : ''}
<p>You can sign in again and send a new request – for example choosing a different profile, or “I’m new to the portal”. If you think this is a mistake, please contact the club.</p>
${button(SITE, 'Open the portal')}`);
  const text = `Hi ${hi},\n\nA club admin wasn't able to approve your request to link your account to a member profile.${reason ? `\nReason: ${reason}` : ''}\n\nYou can sign in again and send a new request at ${SITE}. If you think this is a mistake, please contact the club.\n\nVancouver Rowing Club`;
  return { subject, html, text };
}
export function smtpSettings(env = process.env) {
  // SMTP_USER may be left out when it's the same address as MAIL_FROM (e.g. a Gmail account sending as itself)
  const fromAddr = ((env.MAIL_FROM || '').match(/<([^>]+)>/) || [, env.MAIL_FROM || ''])[1].trim();
  const host = env.SMTP_HOST, user = (env.SMTP_USER || '').trim() || (validEmail(fromAddr) ? fromAddr : ''), pass = env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = +(env.SMTP_PORT || 465);
  return { host, port, secure: port === 465, auth: { user, pass }, from: env.MAIL_FROM || `VRC Rowing Portal <${user}>` };
}
export function validEmail(e) { return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 255; }

const SEV = { cosmetic: 'Cosmetic', attention: 'Needs attention', unsafe: 'Unsafe – do not row' };
export function issueEmail({ boatName, severity, location, description, reporter, photos = [], at }) {
  const sev = SEV[severity] || severity || 'Reported';
  const unsafe = severity === 'unsafe';
  const subject = `${unsafe ? '⚠ UNSAFE: ' : ''}Damage reported – ${boatName || 'a boat'} (${sev})`;
  const link = SITE + '/#issues';
  const rows = [['Boat', boatName], ['Severity', sev], ['Where on the boat', location], ['Reported by', reporter], ['When', at ? at.replace('T', ' ').slice(0, 16) + ' UTC' : '']]
    .filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#777;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('');
  const pics = photos.filter(u => /^https:\/\//.test(u)).slice(0, 6)
    .map((u, i) => `<a href="${esc(u)}" style="display:inline-block;margin:0 8px 8px 0"><img src="${esc(u)}" alt="Photo ${i + 1}" width="160" style="border-radius:6px;border:1px solid #ddd;max-width:160px"></a>`).join('');
  const html = frame(unsafe ? '⚠ Unsafe boat reported' : 'Damage reported', `
${unsafe ? '<p style="background:#fde6e6;border-left:4px solid #c42a30;padding:10px 14px;margin-top:0"><b>Marked unsafe – the boat is flagged “do not row” in the portal.</b></p>' : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px">${rows}</table>
${description ? `<p style="background:#f7f6f3;border-left:4px solid #ea3c42;padding:10px 14px">${esc(description)}</p>` : ''}
${pics ? `<p style="margin:14px 0 4px;color:#777">Photos</p><div>${pics}</div>` : ''}
${button(link, 'Open Issues in the portal')}
<p style="color:#777;font-size:13px">You’re getting this because you’re a portal admin.</p>`);
  const text = `${unsafe ? 'UNSAFE – the boat is flagged do not row.\n\n' : ''}Damage reported\nBoat: ${boatName || ''}\nSeverity: ${sev}\n${location ? 'Where: ' + location + '\n' : ''}${reporter ? 'Reported by: ' + reporter + '\n' : ''}\n${description || ''}\n${photos.length ? '\nPhotos:\n' + photos.join('\n') + '\n' : ''}\nOpen Issues: ${link}`;
  return { subject, html, text };
}

export const CANCEL_REASONS = { air: 'Air quality', wind: 'Wind', lightning: 'Lightning', holiday: 'Holiday', other: 'Other' };
const fmtHM = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${(h % 12) || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`; };
export function dateLabel(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }); }
export function cancelEmail({ title, date, start, end, reasonCode, reason, notes, by, reinstated }) {
  const when = `${dateLabel(date)}${start ? ', ' + fmtHM(start) + (end ? '–' + fmtHM(end) : '') : ''}`;
  const why = CANCEL_REASONS[reasonCode] || reason || '';
  if (reinstated) {
    const subject = `Back on: ${title} – ${dateLabel(date)}`;
    const html = frame('This session is back on', `<p><b>${esc(title)}</b><br>${esc(when)}</p>
<p>The cancellation has been lifted, and your booking stands. See you there!</p>${notes ? `<p style="background:#f7f6f3;border-left:4px solid #2f7d4f;padding:10px 14px">${esc(notes)}</p>` : ''}${button(SITE + '/#programs', 'View the schedule')}`);
    return { subject, html, text: `${title} on ${when} is back on – your booking stands.${notes ? '\n\n' + notes : ''}\n\n${SITE}` };
  }
  const subject = `Cancelled: ${title} – ${dateLabel(date)}${why ? ' (' + why + ')' : ''}`;
  const html = frame('Session cancelled', `<p><b>${esc(title)}</b><br>${esc(when)}</p>
<p style="background:#fde6e6;border-left:4px solid #c42a30;padding:10px 14px;margin:14px 0"><b>Cancelled${why ? ' – ' + esc(why) : ''}.</b>${notes ? '<br>' + esc(notes) : ''}</p>
<p>You were signed up for this session, so we wanted to let you know. Your booking has been cancelled with it – there’s nothing you need to do.</p>
${by ? `<p style="color:#777">Cancelled by ${esc(by)}.</p>` : ''}${button(SITE + '/#programs', 'View the schedule')}`);
  const text = `${title}\n${when}\n\nCANCELLED${why ? ' – ' + why : ''}.${notes ? '\n' + notes : ''}\n\nYou were signed up for this session. Nothing you need to do.${by ? '\nCancelled by ' + by + '.' : ''}\n\n${SITE}`;
  return { subject, html, text };
}

export function claimAdminEmail({ requester, type, memberName, firstName, lastName, programs = [], email, phone, memberNo, note, at }) {
  const who = requester || [firstName, lastName].filter(Boolean).join(' ') || 'Someone';
  const what = type === 'existing' ? `says they are <b>${esc(memberName || 'a member')}</b>` : `is new to the portal: <b>${esc([firstName, lastName].filter(Boolean).join(' '))}</b>${programs.length ? ' · ' + esc(programs.join(', ')) : ''}`;
  const subject = `Join request: ${type === 'existing' ? (memberName || who) : [firstName, lastName].filter(Boolean).join(' ') || who} – please review`;
  const rows = [['Email', email], ['Phone', phone], ['Member number', memberNo], ['Note', note], ['Sent', at ? at.replace('T', ' ').slice(0, 16) + ' UTC' : '']]
    .filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#777;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join('');
  const html = frame('New join request', `<p><b>${esc(who)}</b> (signed in) ${what}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px">${rows}</table>
${button(SITE + '/#admin', 'Review on the Admin page')}
<p style="color:#777;font-size:13px">Approving links their sign-in to the member profile and sends them a welcome email. You’re getting this because you’re a portal admin – you can switch these emails off on the Admin page.</p>`);
  const text = `${who} (signed in) ${type === 'existing' ? 'says they are ' + (memberName || 'a member') : 'is new to the portal: ' + [firstName, lastName].filter(Boolean).join(' ')}.\n${email ? 'Email: ' + email + '\n' : ''}${phone ? 'Phone: ' + phone + '\n' : ''}${memberNo ? 'Member number: ' + memberNo + '\n' : ''}${note ? 'Note: ' + note + '\n' : ''}\nReview: ${SITE}/#admin`;
  return { subject, html, text };
}

export function waitlistEmail({ firstName, title, date, start, end, erg, link }) {
  const when = `${dateLabel(date)}${start ? ', ' + fmtHM(start) + (end ? '–' + fmtHM(end) : '') : ''}`;
  const subject = `You’re in: erg ${erg} for ${title} – ${dateLabel(date)}`;
  const html = frame('An erg opened up for you', `<p>Hi ${esc(firstName || 'there')},</p>
<p>Good news – someone cancelled, and you were first on the waitlist. You now have <b>erg ${esc(erg)}</b> for:</p>
<p><b>${esc(title)}</b><br>${esc(when)}</p>
<p>If you can no longer make it, please cancel in the portal so the next person on the waitlist gets the erg.</p>
${button(link || SITE + '/#programs', 'View my booking')}`);
  const text = `Hi ${firstName || 'there'},\n\nSomeone cancelled and you were first on the waitlist. You now have erg ${erg} for ${title}, ${when}.\n\nCan't make it? Please cancel in the portal so the next person gets it.\n${link || SITE}`;
  return { subject, html, text };
}

const money = n => '$' + (Math.round((+n || 0) * 100) / 100).toFixed(2);
// A no-show / late-cancel fee was applied to the member
export function feeEmail({ firstName, type, amount, title, date, start, hoursBefore, lateHours, closeMin }) {
  const when = `${dateLabel(date)}${start ? ', ' + fmtHM(start) : ''}`;
  const what = type === 'late' ? 'late-cancellation fee' : 'no-show fee';
  const why = type === 'late'
    ? `You cancelled ${hoursBefore != null ? hoursBefore + ' hours' : 'less than ' + lateHours + ' hours'} before the start, and nobody else took the spot. Cancellations less than ${lateHours} hours before class carry this fee.`
    : `You were booked but weren’t checked in by the coach within ${closeMin} minutes of the start.`;
  const subject = `VRC ${what}: ${title} – ${dateLabel(date)}`;
  const html = frame(`A ${what} of ${money(amount)} was applied`, `<p>Hi ${esc(firstName || 'there')},</p>
<p>A <b>${esc(what)} of ${esc(money(amount))}</b> was applied for:</p>
<p><b>${esc(title)}</b><br>${esc(when)}</p>
<p>${esc(why)}</p>
<p>If you think this is a mistake (for example you were there but weren’t checked in), please speak to your coach or a club admin – they can remove it.</p>
${button(SITE + '/#programs', 'Open the portal')}`);
  const text = `Hi ${firstName || 'there'},\n\nA ${what} of ${money(amount)} was applied for ${title}, ${when}.\n${why}\n\nThink this is a mistake? Speak to your coach or a club admin – they can remove it.\n${SITE}`;
  return { subject, html, text };
}
export function feeWaivedEmail({ firstName, type, amount, title, date }) {
  const what = type === 'late' ? 'late-cancellation fee' : 'no-show fee';
  const subject = `Fee removed: ${title} – ${dateLabel(date)}`;
  const html = frame('Fee removed', `<p>Hi ${esc(firstName || 'there')},</p><p>The <b>${esc(what)} of ${esc(money(amount))}</b> for <b>${esc(title)}</b> on ${esc(dateLabel(date))} has been removed. Nothing more to do.</p>`);
  return { subject, html, text: `Hi ${firstName || 'there'},\n\nThe ${what} of ${money(amount)} for ${title} on ${dateLabel(date)} has been removed. Nothing more to do.` };
}
export function feeReportEmail(r) {
  return { subject: r.title + ` · ${r.count} charged, ${money(r.total)}`, html: frame(r.title, r.html + button(SITE + '/#admin', 'Open the Admin page')), text: r.text + `\n\n${SITE}/#admin`,
    attachments: [{ filename: r.title.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') + '.csv', content: r.csv, contentType: 'text/csv' }] };
}
