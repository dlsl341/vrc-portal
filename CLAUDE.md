# VRC Rowing Portal – project guide

Member portal for the Vancouver Rowing Club: **Programs** (weekly sessions, boat/erg booking),
**Fleet** (boats, rigging, status, damage, maintenance) and **Members** (directory, profiles,
history). Built with Claude in Nov 2026 as a claude.ai artifact, then moved to Firebase.
The person who commissions changes is a club volunteer, not a developer: explain changes in plain
language, and keep the "propose → preview link → merge" workflow.

## Architecture
- **No build step.** `public/index.html` is the whole app (HTML + CSS + one `<script type="module">`).
  Firebase SDK v10 is loaded from gstatic in `public/js/firebase-adapter.js`.
- **`public/js/firebase-adapter.js`** implements a small backend interface the app was written
  against (from the claude.ai version): `claude.use('db' | 'user' | 'assets' | 'downloads')`.
  Keep the app talking to that interface; put Firebase specifics in the adapter. It also renders the
  sign-in screen (Google + email link) and first-run "Make me the owner" setup.
  - `db`: Firestore-shaped wrapper (`doc(path)`, `collection(path)`, `onSnapshot`, `set`, `update`…);
    errors are mapped to `invalid_argument` (permission), `unavailable`, `quota_exceeded`.
  - `user`: `canEdit()` = admin, `can('data.write')` = linked member or admin, `id()` = Firebase uid.
  - `assets.upload()` returns the Storage **download URL as the id**; the app stores it and shows it
    via `blobUrl(id)`.
- `public/js/config.js` – Firebase web config (not secret) and club constants.
- `firestore.rules`, `storage.rules` – the real access control. **Tests:** `tests/firestore.rules.test.js`.
- `.github/workflows/deploy.yml` – PRs: rule tests + preview channel link. `main`: tests → deploy
  hosting + Firestore rules + Storage rules + functions. Secrets: `FIREBASE_SERVICE_ACCOUNT`, `C2_CLIENT_SECRET`.

- **Admin page** (`#admin`, nav item shown to admins only, red badge = pending profile requests): requests
  to approve/decline, club admins roster, shortcuts. The Members page links there when requests wait.

- **Results page** (`#results`): members log erg/on-water results (km + time primary; split /500m and
  ~watts computed), filter by program/type/period, a top-km board, and ♥ likes. "Log result" also
  appears on your own booking once a session has started. Rules: own results only; others may only
  add/remove their own key in `likes`. **Cross-training** (`machine` bike/skierg/multierg/…, see `isCross`) is
  listed but excluded from km/time totals, member-card km, the top-km board and leaderboards.
  Distances are stored in km; cards show < 2 km in metres (`fmtDist`); the log form has a km/m toggle
  (`formKm`, last choice remembered in localStorage `vrcDistUnit`).

- **Attendance**: coaches (members with the `coach` role, set by an admin under Edit member → Roles)
  and admins get "✓ Check in athletes" on a session sheet from the day of the session. Present / Late /
  No-show per booked person, walk-ins, "mark the rest present". Stored in `attendance/{sessionId}_{YYYYMMDD}`
  `{sessionId, date, marks{memberId: present|late|absent}}`. Shown as ✓/⏱/✗ on the sheet and as an
  Attendance section + badges on member profiles; walk-ins count as sessions.

- **Leaderboard** (`#leaderboard`, linked from Results and the Programs schedule): one or more programs
  (`S.lbProgs` = list of names, or 'all'; chips toggle, "All programs" resets), rank by
  Kilometres / Time (from `results`, by `program`), Sessions (every session taken part in, from `allActs()`:
  past bookings not cancelled/no-show, walk-ins, open erg (counted for the member's own programs), imported history) or Best 2k erg (2.000 km erg results); period + erg/water filters; podium for top 3.

- **Scheduled maintenance** (Maintenance tab, `maintJobs`): admins schedule a boat + task + time + crew.
  The form suggests free slots (07:00–21:00, avoiding every on-water session ±30 min, the boat's bookings
  and other jobs) and shows a day timeline + clash warnings ("Schedule anyway" to override). A scheduled
  boat is hidden from booking during overlapping sessions. Members join/leave with "I can help"; crew add it
  to their calendar (reuses the booking calendar helpers) and can mark it done (also writes a `maintenance`
  log). Admins get "Email crew" (mailto with calendar links).

- **Open erg** (`#openerg`, "+ Open erg" on Programs): members book an erg (30 min – 2 h, 06:00–21:30, up to
  6 days ahead) in slots with no scheduled erg session; lowest free erg, 18 kept for Para. `openErg`
  (memberId, by, date, start, end, erg, notes). Calendar invite; "Log result" afterwards (result
  `bookingId: 'oe_<id>'`); counts in member history as "Open erg". Rules: own bookings only.
- **Erg waitlist** (`waitlist/{sid}_{YYYYMMDD}_{memberId}` {sessionId, date, memberId, group, by, t ms, at}): on an erg session
  with erg blocks, a member whose block (or the session) is full gets "Join the <group> waitlist" – one line per group
  (Masters / Intermediate …). Session page shows "You're #N" + a Waitlist panel (admins can remove); Home lists it.
  Trigger `ergWaitlistPromote` (bookings written: erg booking deleted/emptied before start, class not cancelled) gives the
  erg to the first in that erg's group (after `ergOpenTime` anyone waiting, never an `only` block), creates the booking
  (`fromWaitlist:true`), deletes the entry and emails them (`waitlistEmail`). Pure logic in `functions/waitlist.js`
  (tests/waitlist.test.mjs). Rules: own entry only, `t` within 5 min of server time (can't jump the line), no updates.
  No automatic promotion at noon itself (would need a scheduler) – after noon waiters can grab any free erg.
- **Coxswains** (`#coxswains` tab, `coxAvail/{memberId}`: offered, weekly{sessionId:true}, dates{"<sid>_<YYYYMMDD>": yes|no}):
  a coxswain = Cox role OR member ticked "I can cox" on their profile (`offered`). They mark availability per
  on-water session for the next 2 weeks (+ "Every week"). Booking form's cox seat lists available coxswains
  first (`coxOpts`); session sheets show a cox bar; the tab shows boats needing a cox and who's available.
  Profiles show a Coxswain section. Rules: own doc, admins any.
- **Concept2 Logbook** (see `docs/CONCEPT2.md`): "Connect Concept2" on My profile → OAuth (read-only) →
  server function `functions/index.js` (`/c2/*` via Hosting rewrite) imports results as `results/c2_<id>`
  (`source:'concept2'`) and follows webhooks. Tokens in `c2Tokens`/`c2Users` are server-only. Client
  secret = GitHub secret `C2_CLIENT_SECRET`, written to `functions/.env` at deploy.

- **Member emails** (see `docs/EMAIL.md`): Firestore triggers in `functions/index.js` send a welcome email on
  approval (`accounts/{uid}` created) and a decline note (`claims/{uid}` → rejected) over SMTP (nodemailer;
  GitHub secrets SMTP_HOST/PORT/USER/PASS, MAIL_FROM). Once-only via `mailLog/{key}` (admins can read;
  Admin page lists recent emails). Unconfigured = skipped. **Damage reports** (`issues/{id}` created) email all
  admins + owner in one BCC'd message (⚠ UNSAFE in the subject for unsafe boats, photos included); an admin
  opts out with the Admin-page toggle (`memberPrefs/{uid}.issueEmails = false`).

- **Cancelling a class**: coaches + admins get "Cancel class" / "Reinstate class" on a session page (today or later).
  Reason code (air/wind/lightning/holiday/other → `CANCEL_REASONS`), notes, "email the N signed up". Stored on
  `occurrences/{sid_YYYYMMDD}` (cancelled, reasonCode, reason, cancelNotes, cancelledBy/At, notify, notified,
  notifyReinstate, reinstateNotes/At). Trigger `emailOnCancel` BCCs everyone booked (crew + cox). Coaches may
  only write those fields (rules); "Edit this date" no longer cancels and merges instead of overwriting.

- **Home dashboard** (`#home`, the default page; brand link + first nav/tab item): greeting + quick actions,
  admin alerts, cancelled-booking heads-up, tiles (rowing km this week vs same point last week, sessions,
  month vs last month, time), "this week by day" + weekly/monthly 12-period trend (`columnChart`, single
  series SVG with hover tooltips; rowing only via `kmOf`/`isCross`), and Coming up (bookings incl. cox,
  open erg, maintenance crews). `[hidden]` is forced to display:none globally.

- **Versions**: each live deploy is `v1.<GitHub run number>`, stamped into `public/version.json` (version, sha,
  date, title = PR title) by the deploy job and recorded as a GitHub release (tag = version). Shown in the
  footer and on the Admin page ("Portal version"). Previews show "preview #<PR>". Roll back by
  redeploying a release tag or Firebase Hosting → Release history.
- **Member number**: `memberPrivate.memberNo` (self + admins). Admins edit it (duplicate check); members
  see it read-only; optional on join requests (`claims.memberNo`, copied on approval, ✓/✗ vs file); admins
  can search the directory by it.
- **Join-request email**: trigger `emailAdminsOnClaim` (claims → pending) BCCs admins; opt-out
  `memberPrefs/{uid}.claimEmails = false` (Admin-page toggle).

## Roles (enforced in firestore.rules)
- **signed in, not linked**: reads `members` only (to find themselves), writes own `claims/{uid}`,
  `profiles/{uid}`. The app shows only the "Find your member profile" screen (`S.guest`).
- **member**: `accounts/{uid} = {memberId}` exists (written by an admin when approving a claim).
- **admin**: `admins/{uid}` exists, or `config/settings.ownerUid == uid` (owner).
- Bookings: create with yourself in crew/cox; booker (`createdBy`/`captain`) or admin edits/cancels;
  others may only change `crew/cox/open/updatedAt` to join an **open** seat or leave. Leaving never
  deletes – empty bookings are filtered out in the UI.

## Data model (Firestore collections)
`boats` · `members` (displayName, programs[], status active|review|inactive, linkedUser, siteAdmin…) ·
`memberPrefs/{uid or memberId}` (sides, experience, bio, photo, calPrompt – public to members) ·
`memberPrivate/{uid or memberId}` (email, phone, emergency, weightKg, medical – self + admins) ·
`claims/{uid}` · `accounts/{uid}` · `admins/{uid}` · `profiles/{uid}` · `config/settings` ·
`programs` (name, color, opensDays, boatRequired, pcocAllowed) ·
`sessions` (programId, weekday 0=Mon, start/end "HH:MM", type water|erg, capacity, eligible[] program names, coach, safety, season, active) ·
`occurrences/{sessionId_YYYYMMDD}` (per-date cancel/coach/capacity overrides) ·
`bookings` (sessionId, date, boatId, rig, crew[] seat order bow→stroke with nulls for open seats, cox, erg, open, crewMix, pcoc, captain, createdBy) ·
`results` (memberId, by uid, date, type erg|water, machine?, program, sessionId?, bookingId?, workout, km, timeSec, watts?, cals?, spm?, hr?, notes, likes{uid:iso}) ·
`openErg` (memberId, by, date, start, end, erg, notes) · `coxAvail/{memberId}` · `waitlist` ·
`maintJobs` (boatId, task, date, start, end, crew[], crewNeeded, notes, status scheduled|done|cancelled) ·
`activity` (imported pre-portal history) · `crews` (designated crews) · `issues` · `maintenance` · `events`.
Private/prefs docs are keyed by **member id** until the member links an account, then moved to the **uid** (see `approveClaim`, `unlinkForm`, `mergeForm`).

## Decisions worth knowing
- Member programs are stored by **name** (`'Masters'`), sessions' `eligible[]` too; renaming a program updates both.
- Masters erg nights have **two waves** (sessions `masters-*-erg` and `masters-*-erg-2`), 18 ergs.
  **Erg numbers are reserved by program** (session field `ergGroups`, default for masters erg sessions
  `Masters 1-12; Intermediate 13-17; Para 18 only`; `only` = block never opens to others): members get the lowest free erg in their own block; the
  other blocks open to everyone at `ergOpenTime` (default 12:00 = noon) on the day. Admins can override.
  Enforced in the app, not in firestore.rules.
- **BC is on permanent UTC-7 since Nov 2026**; `tzOffsetMin()` hard-codes −420 after 2026-03-08 so
  calendar invites are right even on devices with stale time-zone data.
- Sign-ups open `program.opensDays` (default 6) days before and close at session start; admins bypass.
- Novice: `boatRequired: false` (coach assigns). PCOC off for Intermediate/Novice/Para/Juniors.
- Calendar invites: `.ics` download + Google/Outlook links, provider chosen from the member's email.
- Rigs: **sculling** = rig contains `x` (1x 2x 4x 4x+ 8x+), **sweep** = otherwise (2- 2+ 4- 4+ 8+) → `rigStyle`,
  `styleTag`. Fleet cards colour rig chips (blue sculling / amber sweep) + a tag for the current rig; Fleet has a
  Sculling/Sweep filter (by current rig); booking rig choices read "4x · Sculling"; re-rig hints name the switch.
- Photos are resized client-side (damage ≤1600px JPEG, profile 400px square).

## Working on it
- Branch → commit → push → open a PR. The PR gets a preview link; the user merges to go live.
- Run `npm test` locally if Java + network are available; otherwise CI runs it. Add a rules test for
  any rules change.
- UI smoke tests in previous sessions served `public/` and swapped the gstatic Firebase modules for
  in-memory fakes via Playwright request routing – a quick way to exercise flows without a project.
- **Navigation**: Home first; desktop header groups pages in dropdowns (Programs ▾ Weekly schedule/Open erg/Coxswains ·
  Training ▾ Results/Leaderboard · Fleet ▾ Boats/Issues/Maintenance · Members · Admin). ≤1020px: ☰ slide-in
  menu (`#mnav`); ≤700px also a bottom tab bar (Home, Programs, Training, Fleet, Menu). Any `[data-v]` link gets `.on`; badges use `.nb-issues` /
  `.nb-claims`; `[data-admin]` shows for admins. Add a new page to all three places.
- Style: VRC red `#ea3c42` (`--red`), near-black `#231f20`, Libre Baskerville headings, Inter body.

## Open items
- Off-Program (PCOC) sign-out sheet as its own session type (only PCOC-registered members).
- Emailed calendar invites to the whole crew (email sending now exists – reuse `sendOnce` in functions).
- Data clean-up after import: possible duplicates (Missy B/Melissa B, Steph C/G, Elena K/Elana K,
  Colin R/T); Rec program has no members assigned.
