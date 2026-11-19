# Member emails

The server function (`functions/index.js`) sends:
- a **welcome email** when an admin approves a profile request (`accounts/{uid}` created), and
- a short **"request declined"** note (with the admin's reason) when a request is declined.

Templates are in `functions/mail.js` (tests: `tests/mail.test.mjs`). Each email is recorded in
`mailLog` (admins see the latest on the Admin page, with Sent / Failed). Nothing is sent until the
settings below exist – the rest of the portal works without them.

## Settings (GitHub → Settings → Secrets and variables → Actions → New repository secret)
| Secret | Gmail account | Email service (e.g. Resend) |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | the service's SMTP host, e.g. `smtp.resend.com` |
| `SMTP_PORT` | `465` | `465` |
| `SMTP_USER` | the Gmail address | the service's SMTP user name, e.g. `resend` |
| `SMTP_PASS` | a Google **app password** (not the account password) | the service's API key / SMTP password |
| `MAIL_FROM` | `VRC Rowing Portal <that.address@gmail.com>` | `VRC Rowing Portal <portal@your-verified-domain>` |

Gmail: the account needs 2-Step Verification on; then Google Account → Security → App passwords.
Email services: verify the sending domain first (DNS records from the service).

After adding or changing secrets, re-run the latest "Deploy" workflow on `main` (or merge any change).
