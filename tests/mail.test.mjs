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
