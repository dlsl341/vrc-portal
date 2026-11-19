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
  const host = env.SMTP_HOST, user = env.SMTP_USER, pass = env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = +(env.SMTP_PORT || 465);
  return { host, port, secure: port === 465, auth: { user, pass }, from: env.MAIL_FROM || `VRC Rowing Portal <${user}>` };
}
export const validEmail = e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 255;
