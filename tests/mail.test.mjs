import { test } from 'node:test';
import assert from 'node:assert/strict';
import { welcomeEmail, declinedEmail, smtpSettings, validEmail } from '../functions/mail.js';
test('welcome email names the member, programs and portal link', () => {
  const m = welcomeEmail({ firstName: 'James', memberName: 'James Nichol', programs: ['Masters'] });
  assert.match(m.subject, /welcome/i);
  assert.match(m.html, /Hi James/); assert.match(m.html, /James Nichol/); assert.match(m.html, /Masters/);
  assert.match(m.html, /vrc-rower-s-portal\.web\.app/); assert.match(m.text, /Open the portal: https:/);
});
test('names are escaped in the HTML', () => {
  assert.doesNotMatch(welcomeEmail({ firstName: '<b>x</b>' }).html, /<b>x<\/b>/);
});
test('decline email includes the reason only when given', () => {
  assert.match(declinedEmail({ firstName: 'Sam', reason: 'Profile belongs to someone else' }).html, /someone else/);
  assert.doesNotMatch(declinedEmail({ firstName: 'Sam' }).html, /Reason:/);
});
test('SMTP settings: off until configured; 465 = SSL, 587 = STARTTLS', () => {
  assert.equal(smtpSettings({}), null);
  const a = smtpSettings({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'club@gmail.com', SMTP_PASS: 'x' });
  assert.equal(a.port, 465); assert.equal(a.secure, true); assert.match(a.from, /club@gmail.com/);
  assert.equal(smtpSettings({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_PORT: '587' }).secure, false);
  assert.ok(validEmail('a@b.ca')); assert.ok(!validEmail('nope'));
});
import { issueEmail } from '../functions/mail.js';
test('damage email: unsafe boats are flagged in the subject and body, photos included', () => {
  const m = issueEmail({ boatName: 'Atlanta', severity: 'unsafe', location: 'Bow 2 rigger', description: 'Cracked rigger', reporter: 'James Nichol', photos: ['https://firebasestorage.googleapis.com/x.jpg'], at: '2026-11-19T23:00:00Z' });
  assert.match(m.subject, /^⚠ UNSAFE: Damage reported – Atlanta/);
  assert.match(m.html, /do not row/); assert.match(m.html, /Cracked rigger/); assert.match(m.html, /x\.jpg/); assert.match(m.html, /James Nichol/);
  const c = issueEmail({ boatName: 'Fraser', severity: 'cosmetic', description: 'Scuff' });
  assert.match(c.subject, /^Damage reported – Fraser \(Cosmetic\)/);
  assert.doesNotMatch(issueEmail({ boatName: 'x', photos: ['javascript:alert(1)'] }).html, /javascript:/);
});

test('SMTP user falls back to the MAIL_FROM address', () => {
  const a = smtpSettings({ SMTP_HOST: 'smtp.gmail.com', SMTP_PASS: 'x', MAIL_FROM: 'VRC Rowing Portal <vrc.rowing.portal.1@gmail.com>' });
  assert.equal(a.auth.user, 'vrc.rowing.portal.1@gmail.com');
  assert.equal(smtpSettings({ SMTP_HOST: 'h', SMTP_PASS: 'p', MAIL_FROM: 'no address' }), null);
});
import { cancelEmail, dateLabel } from '../functions/mail.js';
test('cancellation email: reason code, notes and date', () => {
  const m = cancelEmail({ title: 'Masters · Sat AM', date: '2026-11-21', start: '09:00', end: '11:45', reasonCode: 'wind', notes: 'Gusts to 40 km/h on False Creek', by: 'Coach Sam' });
  assert.equal(dateLabel('2026-11-21'), 'Saturday, November 21');
  assert.match(m.subject, /^Cancelled: Masters · Sat AM – Saturday, November 21 \(Wind\)/);
  assert.match(m.html, /Gusts to 40/); assert.match(m.html, /9 am–11:45 am/); assert.match(m.html, /Coach Sam/);
  const r = cancelEmail({ title: 'Masters · Sat AM', date: '2026-11-21', reinstated: true });
  assert.match(r.subject, /^Back on:/);
});
import { claimAdminEmail } from '../functions/mail.js';
test('join request email to admins', () => {
  const m = claimAdminEmail({ requester: 'Jamie Lee', type: 'existing', memberName: 'Jamie L', email: 'j@x.ca', memberNo: 'VRC-1042', note: 'Sat Masters' });
  assert.match(m.subject, /^Join request: Jamie L – please review/);
  assert.match(m.html, /VRC-1042/); assert.match(m.html, /#admin/); assert.match(m.text, /Member number: VRC-1042/);
  assert.match(claimAdminEmail({ type: 'new', firstName: 'Sam', lastName: 'Ng', programs: ['Rec'] }).html, /new to the portal: <b>Sam Ng<\/b> · Rec/);
});
