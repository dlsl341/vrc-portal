# Concept2 Logbook connection

Members connect their Concept2 Logbook once (My profile → **Connect Concept2**). Their erg workouts
then appear on the Results page automatically. The portal only **reads** results (scopes
`user:read,results:read`), so Concept2's live API can be used without an approval step.

## How it fits together
- `functions/index.js` – one HTTPS function `c2` (region northamerica-northeast1), reached through
  Firebase Hosting at `/c2/*` (rewrite in `firebase.json`):
  - `/c2/callback` – Concept2 sends the member back here; the code is swapped for tokens.
  - `/c2/webhook` – Concept2 posts here when a connected member's result is added/updated/deleted.
    The body is never trusted: the result is fetched again with the member's own token.
  - `/c2/sync` and `/c2/disconnect` – called by the portal with the member's Firebase ID token.
- `functions/c2map.js` – maps a Concept2 result to a `results` document (`results/c2_<id>`,
  `source: 'concept2'`). Unit tests: `tests/c2map.test.mjs`.
- Firestore: `c2States` (one-time sign-in state), `c2Links/{uid}` (status the member sees),
  `c2Tokens/{uid}` and `c2Users/{c2UserId}` (server only – rules deny all browser access).

## Concept2 developer settings (log.concept2.com → Developer → API Keys)
| Setting | Value |
|---|---|
| Redirect URI | `https://vrc-rower-s-portal.web.app/c2/callback` |
| Scopes | `user:read`, `results:read` |
| Webhook URL | `https://vrc-rower-s-portal.web.app/c2/webhook` (add after the first deploy) |
| Client ID | `CyxYSBWvx6QavQRqq1WonK0BvEkWV9s2qjZ91rNN` (public, in `public/js/config.js`) |

## One-time setup
1. **GitHub secret** – repository → Settings → Secrets and variables → Actions → New repository
   secret: name `C2_CLIENT_SECRET`, value = the Client Secret from Concept2.
2. **Deploy permissions** – Google Cloud console → IAM → the `firebase-adminsdk-…` account → edit →
   add roles: **Cloud Functions Admin**, **Cloud Run Admin**, **Service Account User**,
   **Cloud Build Editor**, **Artifact Registry Administrator**, **Service Usage Admin**.
3. Merge the pull request. The first deploy also switches on the Google Cloud services the function needs.
4. Add the webhook URL on the Concept2 API Keys page.
