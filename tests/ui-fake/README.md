In-memory stand-ins for the Firebase SDK modules, for quick UI smoke tests without a Firebase
project. Serve `public/` locally and, in Playwright, route requests for
`https://www.gstatic.com/firebasejs/**` to the file of the same name in this folder.
Set `window.__USER` (signed-in user or null) and `window.__STORE` (`{"collection/id": {...}}`)
with an init script; writes are recorded in `window.__W`. Optional `window.__DENY(op, path)`
returning true simulates a permission error. Security rules are NOT simulated – see
tests/firestore.rules.test.js for those.
