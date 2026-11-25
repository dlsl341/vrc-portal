# Changelog

Every release of the ICG Retail Operations Portal. The version shows in the
bottom-left of the portal (and on the sign-in page), followed by the build code,
e.g. `v1.1.0 (2067950)`.

Numbering is **MAJOR.MINOR.PATCH**:
- **PATCH** (1.1.0 → 1.1.1): bug fixes, wording, link updates
- **MINOR** (1.1.x → 1.2.0): new features or screens
- **MAJOR** (1.x → 2.0.0): big changes that alter how people use the portal or need data changes

Each release is tagged in GitHub (`v1.1.0` etc.). To roll back a bad release fast,
use Firebase console → Hosting → Release history → ⋮ → Rollback, then fix forward.

## v1.40.0 — 2026-11-25
- **Leadership Training Academy, now in the portal** (P&C → Leadership Academy, Store Managers and
  up). Rebuilt from the Smartsheet page: Key Resources for Managers, Fierce Conversations, Spiffy
  courses, Essential Videos for Leaders, Leading Yourself and Leading Your Teams SOPs, and the Store
  Manager Core Competencies (plus the Store Manager JD).
- **Built-in checklist** replaces the downloadable one: managers tick each training item as they finish
  it and see their % complete. DMs (their district), Support Centre and P&C see a Manager progress table.
- **Key Resources point to the portal**: Retail Operations Portal → Dashboard, Retail Training Academy →
  Training Academy, People & Culture Centre → P&C, The Grind → The Grind. Any old Smartsheet link to
  these pages (Resources, quick links, etc.) now opens the portal page instead.
- P&C can edit the page (Edit page): add the SOP links for Leading Yourself / Leading Your Teams there.

## v1.39.0 — 2026-11-25
- **Retail Training Academy, now in the portal** (P&C → Training Academy; the "Retail Training
  Academy" quick link opens it too, instead of the Smartsheet dashboard). The 10 in-store training
  modules are grouped All Staff (1–5), Keyholder (6) and Management (7–10).
- **Module forms rebuilt in the portal**: each module has the same questions and topic checklist as
  its Smartsheet form (trainee, store, trainer, field leader, date, every topic, trainer notes,
  common terms, 30/60/90 day check-ins on Module 5). Trainers tick what they covered and can reopen
  the record on a later shift to finish it; the form shows % complete as you go.
- **Training tracker**: everyone × modules 1–10 with ✓ or % complete, filter by store, search,
  click a cell to open the record, CSV export. Trainees see "My training" with their own progress.
- Who sees records: Super Admin, Admin, Support Centre and P&C see all; DMs their district's stores;
  Store Managers their store; keyholders and staff the records they made or that are about them.
- **Import from Smartsheet**: P&C can import each module sheet's history from its Excel export.
- Module questions and topics are editable in P&C → Forms.

## v1.38.0 — 2026-11-25
- **P&C menu in the left bar**: clicking P&C now opens its menu in the sidebar: Resources, My
  submissions, Approvals, P&C inbox and Forms (as they apply to you), then the **Quick links**
  (Manager's Drive, Retail Training Academy, Leadership Training Academy, KayaPush, Spiffy, Fierce
  Training, Employee Referral, Anonymous Feedback, ...). External links open in a new tab; portal
  forms open in place. The quick-link tiles are removed from the top of the P&C page on desktop
  (phones still show them, since the sidebar is hidden there).
- The left bar scrolls if its menu is taller than the screen.

## v1.37.0 — 2026-11-25
- **Grow deadlines on your calendar**: open Grow tasks you own (on active projects) and Grow
  approvals waiting on you with a "needed by" date now show on your own calendar (📌), next to your
  Grind deadlines. Clicking one opens the project's Tasks or Approvals tab. Done / not-needed tasks
  and cancelled or complete projects drop off automatically. Also included in "Add to my calendar"
  and in "Sync to my calendar" (after functions are redeployed).

## v1.36.2 — 2026-11-25
- **P&C Admins can change roles** for everyone except Admins and Super Admins, including making
  someone a P&C Admin (and editing other P&C Admins). Admins and Super Admins stay protected, and
  nobody can change their own role. Server rules updated to match.

## v1.36.1 — 2026-11-25
- The former Head Office role is now called **Support Centre** (instead of "Support Office").

## v1.36.0 — 2026-11-25
- **Count on the app icon**: the installed portal app shows the total of your sidebar counts (posts
  to acknowledge, requests and approvals waiting on you, new calendar items, etc.) on its icon in the
  Dock / taskbar / home screen. Windows and Mac (Chrome, Edge, Safari "Add to Dock") work
  automatically; on iPhone/iPad (iOS 16.4+) tap "Show counts on the app icon" in My profile to allow
  it. The count refreshes whenever the app is open or running in the background, and clears on sign-out.

## v1.35.3 — 2026-11-25
- The **Head Office** role is now called **Support Office** everywhere it appears as a role or
  audience (user lists, role pickers, Roles & permissions, Grind/calendar audiences, sign-up and
  access messages). Same permissions; nobody's access changes.

## v1.35.2 — 2026-11-25
- **High Five → "Send it to them on Slack too"**: when Slack is on for High Fives, the High Five
  form has a Slack option (ticked by default) that DMs the teammate right away, alongside or instead
  of the email. Their work email is used to find them in Slack.

## v1.35.1 — 2026-11-25
- Email delivery now shows the Slack result under each message ("Slack: 1 sent", "Slack is off for
  this kind", or "not found in Slack: name@…"). Slack-only messages that reached nobody are marked
  Failed with the reason, instead of Sent (after functions are redeployed).

## v1.35.0 — 2026-11-25
- **Slack direct messages** (Admin → Sign-in & security → Slack, Super Admins): the portal can DM
  people in Slack, matched by work email, with a button back to the portal. Choose any of:
  - **Urgent Grind posts**: everyone the post is for, once, when it goes live (scheduled posts too).
  - **High Fives**: the recipient, when their High Five is approved for The Grind.
  - **Urgent service requests**: Emergency and High priority requests, to the same people as the email.
  - **Grow approvals**: approvers when something needs them; the requester with the outcome.
  Paste the Slack bot token once (stored so only the server can read it) and use "Send me a test".
  People not on Slack are skipped and still get email. Delivery results show in Email delivery.
  Needs functions redeployed: `npm run deploy:email` (see SETUP.md → Slack).

## v1.34.2 — 2026-11-25
- **"Manage High Fives" is now a permission** in Admin → Roles & permissions (server-enforced), so a
  Super Admin can choose which roles see and manage Reports → High Fives (approvals, monthly draw,
  export/import). On by default for Admin and P&C Admin; existing saved permissions get it added for
  those two roles the first time a Super Admin signs in after the update.

## v1.34.1 — 2026-11-25
- **P&C Admins see all Reports**: the High Fives tab (dashboard, approvals to The Grind, monthly
  draw, CSV export and import) is now available to P&C Admins as well as Admins, including the
  Reports badge for High Fives waiting for approval. Database rules updated to match.

## v1.34.0 — 2026-11-25
- **Add the app to your desktop or phone**: new section in My profile (and in the account menu)
  with steps for the device and browser you're on. iPhone/iPad: Share → Add to Home Screen.
  Android, Chrome and Edge: an **Install now** button. Mac Safari: File → Add to Dock. The app
  uses your brand's icon and name. Hidden once you're using the installed app.

## v1.33.1 — 2026-11-25
- Grow task list: accountable department and owner are stacked neatly (no more cut-off "Un…"),
  date and status boxes are a fixed, compact size, and the timing note says what it's relative to
  ("14d before Day 1", "(not set yet)" when the project has no date).
- Empty date boxes no longer show today's date in grey in Safari, anywhere in the portal.

## v1.33.0 — 2026-11-25
- **Sort any table by clicking a column heading** (▲ ascending, ▼ descending, third click back to
  the default order), on every page with tables: Service Requests, Fleet, Users, Grow tasks and
  quotes, P&C submissions, Feedback, Reports and more. Dates, amounts, store numbers, priorities
  (Urgent → Low) and target times ("Overdue 3d", "Due in 24h") sort by their real value, and blanks
  go last. Your choice is remembered while you move around the portal. Headings also work with the
  keyboard (Tab, then Enter).

## v1.32.0 — 2026-11-25
- **Grind deadlines on your calendar**: when you acknowledge a required Grind post that has a
  deadline, the deadline appears on your own calendar (📌, only you see it). Task posts assigned to
  you show their due date too. Clicking one shows the post summary and opens it in The Grind.
- **Add to my calendar** on every calendar item: Google, Outlook / Microsoft 365, or Apple / other
  (.ics download).
- **Sync to my calendar** (Calendar page): a personal subscription address for Google Calendar,
  Outlook / M365 and Apple Calendar that keeps itself up to date with the company events you can see
  plus your own Grind deadlines. One-click buttons for each app, a copyable address, a one-time .ics
  download, and "Reset address" to revoke an old link. Needs the server part deployed once:
  `npm run deploy:email` (see SETUP.md → Calendar sync).

## v1.31.1 — 2026-11-25
- New department **E-Commerce** in the department-lead list on profiles and in Grow's accountable
  departments. Grow checklist tasks from the E-Commerce section (Dutchie store, Google Business
  Profile, website pages, delivery, loyalty, online listings) are now accountable to E-Commerce
  instead of Marketing; open tasks on existing projects move over automatically.

## v1.31.0 — 2026-11-25
- **Grow: Store renovations and Brand conversions.** New project types for existing Fleet stores:
  pick the store (and, for a conversion, the brand it's converting to) and the project fills in from
  Fleet. Each has its own stages, milestones, budget categories and a standard checklist (24 tasks
  for renovations, 33 for conversions) assigned to department leads, timed from the target completion
  / relaunch date. They appear on the portfolio board, timeline and filters.
- **Scope & quotes** tab: write the scope of work and attach documents; add vendor quotes with PDFs
  by budget category (lowest flagged, expired flagged) and push one for approval.
- **Designs** tab: layouts, renderings, signage artwork and drawings with version history; push any
  design for approval.
- **Approvals** tab (all project types): push a quote, a design or the overall project budget to the
  people you choose. Each gets an email with a link and sees it under "Waiting for your approval" on
  the Grow page (plus the Grow badge). Everyone picked must approve; one rejection sends it back with
  the comment. An approved quote is committed to the budget and the other quotes in its category are
  marked not selected; an approved design is marked approved (new versions go back to draft); an
  approved budget shows "Budget approved $X" on the project. The requester is emailed the outcome.
- **Brand conversion → Fleet**: setting a conversion to Complete offers to update the store in Fleet
  (new brand, name and optionally a number from the new brand's series), keeping the store history,
  user store assignments and confidential codes.
- Links like `/#grow/<project>/appr` open a project tab directly.

## v1.30.0 — 2026-11-25
- **Grow → Add existing stores**: create Grow projects straight from stores already in Fleet (e.g.
  acquisitions that are already trading, like the Burb and THC stores). Filter by brand, "Select all
  shown", choose NSA or NSO, project lead, starting stage, an optional shared Day 1 date, whether to
  add the standard checklist (owners set to department leads), and whether to email the leads now.
  Each project is linked to its Fleet record; stores already in Grow are greyed out.

## v1.29.1 — 2026-11-25
- **Grow → Cancel project** with double confirmation: step 1 asks for the reason (and offers to email
  everyone with open tasks), step 2 requires typing the project name. Choosing "Cancelled" in the
  status list goes through the same steps. Cancelled projects show who cancelled them, when and why,
  drop out of due lists and the Monday digest, and have a **Reopen project** button.

## v1.29.0 — 2026-11-25
- **Add / Edit brand → "Get logo & colours"**: type the brand's website and the portal reads it and
  fills in the brand name, email domain, logo, sidebar / highlight / button / background colours and
  fonts (when the portal has them), plus the app icon from the site's home-screen icon. The colours
  found on the site are shown as swatches you can apply to any field. Works from Grow → Add new brand
  and Admin → Brands. Needs the server part deployed once: `npm run deploy:email` (see SETUP.md).
- SVG logos without their own size no longer disappear.

## v1.28.0 — 2026-11-25
- **Grow → Add new brand** (people with the brands permission, e.g. Super Admins): the brand form
  (name, email domains, colours, fonts, logo, app icon) now includes a **store number series**
  (100–900; e.g. 900 = stores #900–#999). Series already used by a brand are greyed out; existing
  brands show the series their Fleet stores use. Also editable in Admin → Brands.
- **New project**: picking a brand suggests the next free store number in its series.
- **Duplicate check**: new projects and Edit details flag a store number or name that's already
  used in Fleet or by another Grow project. A duplicate number is blocked; a duplicate name asks to
  confirm.
- **Add to Fleet** on a Grow project (people with Fleet access): opens the Add store form prefilled
  from the project (number, brand, name, address, province, opening date, "Opening soon"), then links
  the project to the new store ("✓ In Fleet as #901" opens the Fleet record).
- Checkbox labels that wrap to two lines now line up under the text.

## v1.27.0 — 2026-11-25
- **Developer Feedback** (new page, off until a Super Admin turns it on in Admin → Sign-in & security):
  - Anyone can send a bug, issue, feature request or idea with Low / Medium / High priority, a
    detailed note and screenshots (attach, drag in, or paste with Ctrl/Cmd+V). The page they were on,
    the portal version and their browser are recorded automatically. Also in the account menu
    ("Send feedback about the portal") so it can be sent from any page.
  - **My feedback** shows each person's items with status, the version it was fixed in and release notes.
  - **What's new** lists everything shipped from feedback, by version.
  - **Dashboard** (Super Admins): counts, filters (status, priority, type, search), and each item's
    status (New → Reviewed → With Claude → In progress → Ready to test → Done / Won't do / Duplicate),
    priority, version shipped and release notes, plus comments with the sender.
  - **Copy for Claude** copies an item (or all open items) with screenshot links, ready to paste
    into a chat with Claude, and marks it With Claude.
  - Emails: Super Admins get new items; the sender gets an email when it's Done (with version and
    release notes) or Won't do, and when a Super Admin comments. Nav badge counts new items.
- Database and storage rules: senders see only their own feedback and screenshots.

## v1.26.1 — 2026-11-24
- Job titles now show under each person's name in Admin → Users (and are searchable there), and in
  the top bar next to your store instead of the role name.

## v1.26.0 — 2026-11-24
- **Profile photos**: upload a photo on My profile (or, for Admins / P&C Admins / Super Admins, on
  anyone's profile from Admin → Users → Edit). Photos are centre-cropped and resized automatically
  and show everywhere the initials circle did (top bar, user lists, Fleet DM cards, etc.). Remove
  puts the initials back.
- **Job title** is now clearly labelled on the profile, with suggestions from titles already in use
  so titles stay consistent (you can still type a new one).
- Profile form: the "P&C team" checkbox no longer sits on a separate line from its label.

## v1.25.1 — 2026-11-24
- New department **Category Management** in the department-lead list on profiles (and in Grow's
  accountable-department filters and progress). Grow checklist tasks from the Category Management
  section (merch plan, cannabis order, assortment, ordering) are now accountable to Category
  Management instead of Retail; open tasks on existing projects move over automatically, and any
  still with the Retail lead are reassigned to the Category Management lead once one is set.

## v1.25.0 — 2026-11-24
- **Grow → Path to open** (new tab on new store openings): enter the handover (keys) date and the
  portal works out the realistic opening window, step by step, from keys + POS install through
  compliance, regulator inspection, licence, PST, cannabis order, delivery and merch.
  - Regulator steps count only regulator business days (Mon–Fri, no provincial stat holidays);
    team steps include weekends when "Our team works weekends" is ticked.
  - Bars show best case (solid) to worst case (lighter), weekends and stat holidays are shaded,
    and the header shows "Keys … → Open …" plus whether the projected opening day fits the window.
  - Click a step to record its actual date; everything after it re-flows (e.g. a licence that
    arrives before the keys).
  - One click sets the projected opening day to the best or worst case (tasks and milestones move).
  - Edit steps & timings per project (add/remove steps, best/worst days, same-day starts).
  - Province rules: **BC** matches the fall 2026 openings (#407 and #505 reproduce the planning
    slide exactly). **AB, SK and ON are draft timings** and are flagged on screen until confirmed.

## v1.24.2 — 2026-11-24
- Grow: "Opening day" is now labelled **Projected opening day** (project page, new project, change-date
  window and Excel import).

## v1.24.1 — 2026-11-24
- **Grow project overview layout**: on laptop-width screens the Milestones table no longer slides under
  the Progress / Next up / Budget cards. Below 1500px wide the overview now stacks in one column, and
  on wider screens Milestones gets the wider column.
- Empty milestone dates no longer show today's date in grey (Safari fills blank date boxes with
  today's date). If the opening day isn't set, the table says to set it first.

## v1.24.0 — 2026-11-24
App review clean-up: fixes, privacy and security tightening, and finishing prototype leftovers.
- **Saves no longer overwrite each other**: the portal now saves only the fields that changed (and
  adds to lists rather than replacing them). Before, two people acknowledging the same post, ticking
  the same Grow task or commenting on the same ticket at nearly the same time could wipe out one
  another's change.
- **Anonymous feedback stays anonymous**: anonymous P&C form submissions no longer write the
  submitter's name to the audit log or their email to the Email delivery log.
- **Session timeout is enforced**: people are signed out after the inactivity period set in
  Admin → Security (activity in any tab counts). Previously the setting was shown but not applied.
- **"Send reminder" and "Nudge" now email people**: required-reading reminders go to everyone who
  hasn't acknowledged; overdue-task nudges go to the store manager email on the Fleet record and any
  SM accounts at the store. Before, these only showed a "Prototype" message.
- **Audit log can't be faked**: each entry now records the signed-in account's email, checked by the
  database rules.
- **Attachment deletes restricted** to DM / Head Office / P&C Admin / Admin / Super Admin (before,
  any signed-in user could delete any Grind or ticket attachment through the API).
- **Email queue** rejects messages that claim to be from someone else.
- Vault: removed the outdated "Prototype only… kept in memory" note (values are saved and logged).
- Fleet: removed the non-working "Re-sync from Smartsheet" button.
- Security settings: the MFA setting now explains it's turned on in Microsoft Entra / Google Admin.

## v1.23.0 — 2026-11-24
- **Brand app icons**: saving the portal to a phone home screen or installing it on a desktop now uses
  the signed-in person's brand icon and name (Inspired Group, Inspired, Imagine, Dutch Love, CSC, Muse,
  13th Floor, Burb, THC), with the brand colour for the browser bar. Also the browser-tab icon. Each
  brand has its own web app manifest. Admin → Brands → Edit has an optional **App icon** upload (square
  PNG, 512×512+) to replace the built-in one (used on iPhone and the browser tab; new brands without
  built-in icons use the Inspired Group icon on Android/desktop)

## v1.22.2 — 2026-11-24
- **Grow Collaborator** added to the profile's department list: Grow access for someone who doesn't
  lead a department (no tasks are auto-assigned to them; they can still be picked as an owner).
  Shown as "· Grow Collaborator" in owner pickers. Earlier Grow Collaborator ticks show here too

## v1.22.1 — 2026-11-24
- A person can now **lead several departments**: Department lead = Yes shows a tick list (Retail,
  Operations, Marketing, P&C (HR), IT, Finance, ELT). Grow tasks for any of those departments go to
  them; owner pickers and project teams show all the departments they lead. Existing single-department
  leads carry over

## v1.22.0 — 2026-11-24
- **User profiles: Title and Department lead.** "Job title" is now "Title"; new **Department lead?**
  Yes/No with a department: Retail, Operations, Marketing, P&C (HR), IT, Finance, ELT (set by Super
  Admins and P&C Admins; enforced in the database)
- **Grow access = department leads** (plus Super Admins) instead of the Grow Collaborator tick
- **Checklist accountability**: every Grow task has an accountable department (mapped from the
  template: e.g. Electronics/POS/internet → IT, P&C → P&C (HR), E-commerce → Marketing, Category
  Management → Retail, All → ELT). New projects assign each task to that department's lead and send
  each lead one summary email; leads can reassign to their team. Change a task's accountable
  department and it moves to that lead. "Assign to department leads" fills unassigned tasks on
  existing/imported projects; filter tasks by accountable department; overview shows progress per
  accountable department with its lead. Owner pickers show each person's lead department or title

## v1.21.0 — 2026-11-24
- **New Grow module** for New Store Openings (NSO) and New Store Acquisitions (NSA). Only **Grow
  Collaborators** (new tick on user profiles, set by a Super Admin) and Super Admins can see it;
  enforced in the database and file storage
- **Portfolio**: pipeline boards by stage (NSO: site selection → LOI/lease → design & permits →
  construction → licensing & inspection → turnover & setup → open → post-open review; NSA: prospect →
  LOI → due diligence → closing prep → Day 1 → integration & conversion → post-conversion review),
  health (auto from overdue tasks / late or slipped milestones, or set manually), % complete, KPIs
  (active projects, openings in 60 days, overdue tasks, budget spent)
- **Timeline** across projects with milestones (original vs current dates show slippage) and today line;
  **Due & overdue** (replaces the Smartsheet rollup reports) and **My tasks**
- **Projects**: templates built from the Smartsheet NSO Template (143 tasks) and NSA Task List
  (102 tasks) across departments and sections; due dates calculated from the opening day / Day 1
  (changing it reschedules open tasks and milestones); owners are portal users (email on assignment)
  with the department label kept; status, notes, lead times, add/edit/delete tasks, CSV export
- Milestones (lease → permits → GC handover → LDB inspection → licence → turnover → opening →
  30-day review; NSA: LOI → diligence → licence transfer → Day 1 → POS conversion → review), budget
  (budget / committed / actual / variance by category), RAID log (risks, assumptions, issues,
  decisions), documents (lease, permits, drawings, licences…), NSA seller document checklist (from
  the Smartsheet NSA Document Checklist), notes, team, activity log
- **Import from Smartsheet**: Excel export of a project sheet keeps departments/sections (from the
  sheet hierarchy), owners, dates, status, notes, target date and GC/turnover dates
- **Weekly Grow digest** email (Mondays 7:00 Pacific) to each task owner: overdue + due in 2 weeks
  (new `growDigest` function: deploy with `npm run deploy:email`)

## v1.20.0 — 2026-11-24
- **P&C form approvals use "Reports to"**: Request to Hire, Status Change, Borrowing and Job/Promotion
  Offer go to the submitter's Reports to (from their user profile). No Reports to (or that person is
  inactive): P&C approves. The form says who it's going to before submitting; P&C can approve on the
  approver's behalf or change the approver (any manager). Form builder option renamed accordingly.
  Database rule: a submission can only be routed to the submitter's own Reports to
- **New role: P&C Admin** (Super Admin assigns it). Oversight of confidential employee information:
  every P&C submission and uploaded document, the form builder, P&C team membership (only Super
  Admins and P&C Admins can tick "P&C team"), read-only traveler profiles (home address, phone,
  loyalty) from the user profile, user management for Head Office and below. Admins can't create or
  edit P&C Admins. Sees all stores like Head Office. Editable in Roles & permissions

## v1.19.0 — 2026-11-24
- The remaining 8 P&C forms are built and live, from the PDFs of the Smartsheet forms: Job/Promotion
  Offer Letter Request (DM approval), Onboarding (documents upload, uniform, email, source, posting),
  POS Add User Request, Employee Relations Documents Submission, Monthly Check-In (Store Teams),
  1st Interview (Associates: all guide questions with interviewer tips, resume upload), Employee
  Referral (full policy shown, resume upload; open to everyone) and Anonymous Feedback & Reporting
  (no identity recorded; open to everyone). Each has a P&C checklist
- Status Change picks up the live form's guidance (home-store rule, resignation/termination/LOA
  requirements, ER form pointer) and the "current position" question
- All 13 P&C forms now open in the portal from the P&C page. Dropdown choices that weren't visible in
  the PDFs use sensible defaults and can be edited in P&C → Forms
- Forms not edited by P&C update automatically to newer built-in versions

## v1.18.0 — 2026-11-24
- **P&C forms in the portal** (replacing Smartsheet forms). Built from the Smartsheet sheets:
  Request to Hire, Status Change, Borrowing Employee, Uniform Request, 30/60/90 Day Probationary
  Review. Questions appear only when relevant (e.g. resignation reason, last day worked, new title
  and pay), name/email/store/date pre-fill, file uploads
- Live forms automatically replace their Smartsheet links on the P&C page ("In portal")
- **DM approval**: Request to Hire, Status Change and Borrowing go to the store's District Manager
  (from Fleet); P&C can approve on their behalf or change the approver. Emails to the approver,
  submitter and P&C team at each step
- **P&C inbox** (new **P&C team** tick on user profiles): all submissions, filters, per-form
  processing checklist from the Smartsheet columns (payroll, Slack, Spiffy, KayaPush, exit survey…),
  status (in progress / done), internal notes, activity, CSV export, Smartsheet history import
  (columns and checkbox columns matched by name)
- **Form builder** (P&C team): create/edit forms, question types, required, pre-fill, show-when
  conditions, approval, anonymous, checklist, extra emails, Live/Draft. The 8 forms whose sheets
  aren't shared (Job Offer Request, Onboarding, POS add/change, ER documentation, Monthly Check-In,
  1st Interview, Employee Referral, Anonymous Feedback) are drafts ready to build
- Tabs on P&C: Resources, My submissions, Approvals, P&C inbox, Forms; menu badge for approvals
  and submissions ready for P&C
- Rules: `forms`, `pcsubs` (P&C team / submitter / approver only), storage `pcs/` uploads limited
  the same way; `pcTeam` can't be self-assigned

## v1.17.0 — 2026-11-24
- **New P&C (People & Culture) module** in the menu, rebuilt from the Smartsheet "People & Culture
  Centre" dashboard: Quick links (Manager's Drive, Retail/Leadership Training Academy, KayaPush,
  Spiffy, Fierce Training, Employee Referral, Anonymous Feedback), Submit a High Five (the portal's own
  High Five, replacing the five brand forms), Hiring & onboarding (4-step guide + Steps 1–4 forms
  and templates), Performance management (ER documentation, leadership tools, corrective action,
  succession, coaching & feedback, performance reviews), Employee resources (TELUS Health EAP,
  full-time benefits, perks). 77 links, file-type icons, search
- Manager content (hiring, performance, Manager's Drive, Leadership Academy) shows to Store Managers
  and up; employee resources to everyone. **Edit page** (resource-library permission): add/rename/
  reorder sections, change who sees them, edit links. Rule: `pc` collection

## v1.16.1 — 2026-11-24
- High Five dashboard moved from Admin to **Reports → High Fives** (tab next to Store reports; still
  only for people with the Admin-page permission, since it shows anonymous senders). The number for
  posts waiting for approval now shows on the Reports menu item

## v1.16.0 — 2026-11-24
- **High Five program** (peer recognition), replacing the Smartsheet form. Anyone can click
  **Send a High Five** (Dashboard and The Grind). Same fields as the form: teammate, manager, contact,
  region, location, company value, description, attach your name or stay anonymous. Names, email,
  location, manager and region fill in automatically when the teammate is in the portal
- Sharing options: email it to the teammate, post it in The Grind (**admin approves first**), email
  yourself a copy. Recipients see "You've received N High Fives" on their dashboard
- **Admin → High Fives dashboard**: totals, by company value, top locations, 12-month trend, most
  celebrated, filters (month, region, location, value, search), full list with details, CSV export,
  approve/decline Grind posts (choose everyone / store / province / brand), Admin menu badge for
  approvals waiting
- **Monthly draw**: Run draw picks a random winner (one entry per High Five received that month);
  records the $50 winner and $20 sender, gift-card-given checkboxes, Announce in The Grind, Redraw
  with a reason (history kept)
- **Import from Smartsheet** (Excel export of the High Five sheet, last 12 months, no emails/posts)
- Rules: `highfives` (send: anyone active; read: admins, sender, recipient), `hfdraws` (admins)

## v1.15.1 — 2026-11-24
- Fix: **Open SOP** (and Grind / service request attachments) now open the file in a new browser tab
  using a secure download link. The old in-portal preview downloaded the file in the background,
  which the storage bucket blocks from the browser, so nothing opened

## v1.15.0 — 2026-11-24
- **SOP library (Resources → SOPs)**. People with "Manage the resource library and SOPs" (Admins by
  default) can upload SOPs (PDF/Office, up to 25 MB) with title, SOP number, department/category
  (add new ones on the fly), owner, summary, optional review/expiry date, and who it applies to
  (roles; all stores, regions, brands, districts or picked stores — same targeting as The Grind)
- Every version is recorded with version number, publish date/time, who published it and what
  changed; full version history for admins
- Publishing posts **required reading** to The Grind for exactly that audience (open the SOP from the
  post); staff can also click "I've read this version" on the SOP. A new version retires the old post
  and needs to be read again. Admins see "Read by X of Y" and who's still to read
- Expired SOPs stay visible marked "Expired · under review"; **Needs review** list for admins; the
  owner is emailed 30 days before and on the review date. Archive/restore
- Staff filters: All SOPs, To read, department and search
- The Grind "waiting on you" only counts required posts actually aimed at you
- Rules: `sops` collection (read: active users; write: resource-library permission); file limit 25 MB

## v1.14.2 — 2026-11-24
- Fix: trips created before the traveler's **Reports to** was set now pick up that approver when
  approval is requested (was "No approver set"). Database rule allows the traveler to fill an empty
  approver with their own Reports to only

## v1.14.1 — 2026-11-24
- Super Admins can set their own **Reports to** (travel approver) and travel coordinator setting
  in **My profile** (and on their own row in Admin → Users)

## v1.14.0 — 2026-11-24
- **The Grind menu number = waiting on you**: required posts you haven't acknowledged plus tasks you
  still need to complete. Hover for the breakdown; new **Waiting on me** filter in The Grind
- **Calendar menu number = new entries since your last visit** (added by someone else, today or
  later). Opening the Calendar shows a **New since your last visit** list and marks them NEW on the
  month grid; the number clears once you've looked. Starts counting from each person's first visit
  after this update, so existing entries don't flood it. Stored per person with their favourites

## v1.13.1 — 2026-11-24
- **Service Requests menu number now means "waiting on you"**: requests assigned to you and not
  started, new unassigned requests in a department you're a member of, and resolved requests waiting
  for you to confirm. (Before, admins saw every unassigned request in the company.) Hover the number
  for the breakdown; new **Waiting on me** filter on the Service Requests page shows exactly those

## v1.13.0 — 2026-11-24
- **Travel requests ask about baggage** when a flight is needed (carry-on only / 1 / 2 / 3+
  checked bags, required) plus optional oversized or special items; shown on the trip and in the
  travel desk email
- **Traveler profile: contact section** for bookings: full name as on government ID, mobile phone,
  home address (street, city, province, postal code). Shown to the travel desk on each trip; kept out
  of emails. New requests remind travelers if phone or address is missing

## v1.12.0 — 2026-11-24
- **Email sender switched to the Gmail API with a service account** (no password). Google was
  rejecting app-password sign-in for portal@ (535 BadCredentials). Sends as portal@, saves to its
  Sent folder; clearer error messages in Admin → Email delivery. Setup in SETUP.md → Email

## v1.11.0 — 2026-11-24
- **Admin → Email delivery:** shows the last 60 portal emails with Sent / Failed / Waiting and the
  exact error, so delivery can be checked without Terminal (needs the Audit log permission;
  database rule added)
- Travel activity now says "Email queued" (it only confirms the portal handed it to the mailer)
- Mail sender fix: modular firebase-admin Firestore call

## v1.10.0 — 2026-11-24
- **Service request emails are now sent for real** (were only logged): new request (department
  inbox, assignee, DM when set, store + requester confirmation), assigned, visit scheduled, in
  progress, on hold, resolved, closed, reopened, cancelled, comments and transfers. Each email
  links straight to the request (`#service/<id>`). Imported Smartsheet history never emails.
- **Invite user emails the person** with the portal link and how to sign in (Microsoft 365, Google
  or email link). Checkbox to skip; **Resend invite** button on invited users; bulk upload's
  "Email an invite" option now sends; approving an access request emails the person too.

## v1.9.1 — 2026-11-24
- **Email now sends through Google Workspace** instead of Microsoft 365 (M365 isn't fully set up
  yet): one portal account with a Google app password. Same safety rules (ICG domains only) and
  SENT/ERROR result on each message. Setup in SETUP.md → Email

## v1.9.0 — 2026-11-24
- **Email sending switched on (once set up):** new `sendMail` Cloud Function sends the
  portal's queued email through Microsoft 365 from one mailbox
  (portal@inspiredcannabis.ca by default), so everyone gets it whether they're on
  Microsoft 365 or Google. Only sends to ICG's allowed email domains; records SENT/ERROR
  on each message. Setup steps in SETUP.md → Email; deploy with `npm run deploy:email`

## v1.8.0 — 2026-11-24
- **New Travel module** (menu → Travel), for Head Office and District Managers
  (permission "travel"); never shown to Store Managers or store staff
  - **Traveler profile:** airlines, home airport, seat, cabin, airline/hotel/car loyalty,
    Known Traveller/NEXUS, hotel and car preferences, how incidentals and car rentals are
    paid (card type + last 4 only, never full numbers), other needs. Editable any time
    (also from the profile menu); visible only to the traveler and the travel desk
  - **Travel request:** trip type, from/to, dates and times, flight/hotel/car/other,
    hotel dates and area, business purpose, cost centre, trip-specific preferences, notes
  - **Workflow:** submitted → travel desk enters a quote and clicks *Complete quote* →
    traveler clicks *Request approval* → their "Reports to" approves or declines →
    travel desk marks it *Booked*. The travel desk can approve on the approver's behalf,
    change the approver, act for travelers without portal access, and book for anyone
  - Tabs: My trips, Approvals, Travel desk (filters by status), Traveler profile; badges
    show what needs your action; full activity history on each trip
  - Emails at each step (travel@inspiredcannabis.ca, traveler, approver) are queued for
    sending; see SETUP for connecting a sender
- **User profiles:** Admins can set *Reports to* (travel approver) and mark someone as
  *Travel coordinator*
- Security rules: trips readable only by the traveler, approver, requester and travel
  desk; travelers and approvers can only make their own step; profiles private

## v1.7.2 — 2026-11-24
- **Cannabis Supply Co. rebrand** to match cannabissupply.ca: new leaf-and-mountain
  badge logo, forest green (#082B0C) with trail orange (#EA8601), Montserrat headings.
  Replaces the old black-and-gold look. The stored brand updates automatically the
  next time a Super Admin signs in

## v1.7.1 — 2026-11-24
- **Service visits on the calendar** are now built from the service requests each person
  is allowed to see, instead of being stored in the shared calendar. Stores, DMs and Head
  Office still see the visits that apply to them; nobody else can read them. Clicking a
  visit opens its request. Old stored visit entries are cleaned up automatically
- **Service request photos and files** are stored per request and protected by the same
  store rules as the request itself (Head Office/Admin all; DMs their district; staff
  their own store; plus requests they opened)
- Calendar entries can no longer carry service request details

## v1.7.0 — 2026-11-24
- **Service requests are now restricted by the database**, not just the screen:
  - Super Admin, Admin and Head Office: every store
  - District Managers: only the stores assigned to them in Fleet → Districts
  - Store Managers and store staff: only their own store
  - Anyone can still see requests they opened themselves
  - The same limits apply to updating requests
- Each District Manager's store list is kept on their account automatically whenever an
  Admin changes districts. A DM needs to refresh the portal to pick up a change
- People signing themselves up can't give themselves a store list

## v1.6.1 — 2026-11-23
- **Service Request dashboard scope:** Super Admins, Admins and Head Office see every
  store. District Managers see only the stores assigned to them (Fleet → Districts);
  Store Managers and store staff see only their own store. Requests someone opened at
  another store no longer count toward their dashboard
- The dashboard header shows the scope ("Your district: 6 stores" / "Your store: …"),
  and tells a DM with no stores assigned who to ask

## v1.6.0 — 2026-11-23
- **Editable permissions.** Admin → *Roles & permissions* is now a live matrix that
  Super Admins can change: tick what Admin, Head Office, District Manager, Store Manager
  and Store User can do, then *Save changes* (or *Reset to defaults*). Applies instantly
  to everyone in that role; every change is written to the audit log
- Permissions: post to The Grind (messages and tasks), add calendar events, edit anyone's
  posts and events, Reports, Service Request dashboard, Admin page, manage users,
  resource library, Fleet, confidential store codes, audit log, brands
- Most permissions are enforced by the database (security rules), not just hidden in
  the screen. Super Admins always keep everything; sign-in settings, giving the
  Admin/Super Admin role and changing permissions stay Super Admin only
- Admin page tabs and the menu follow each person's permissions

## v1.5.0 — 2026-11-23
- **Import Grind posts from Smartsheet:** The Grind → *Import from Smartsheet* (Admins)
  reads the THE GRIND Excel export. Default: last 12 months (by Created date)
  - Subject → headline, Communication → message, Starting Date → publish date
  - Category mapped (People & Culture → People, Store Operations → Ops,
    Promotion / Visual Merchandising / Monthly Programming / Loyalty → Marketing,
    Product Updates / Product Knowledge → News)
  - Stores Included mapped to targeting: All stores, provinces, or the exact stores for
    brand + province combinations; Support Office → Head Office audience
  - Shows "Runs [start] – [end]" and who it came from (Posted From)
  - Optional: use End Date to move finished posts to *Ended*
  - Re-runnable: matched per post, no duplicates, portal edits are kept
- Smartsheet row attachments are not in the Excel export and aren't imported

## v1.4.0 — 2026-11-23
- **Tasks in The Grind.** A post can now be a *Task with steps* instead of a message:
  - Any number of steps (reorder, remove), each optionally requiring a photo
  - Assign to **stores** (targeted like posts: all, province, brand, district, specific
    stores; each store completes its own copy) or to **specific people**
  - Due date, optionally added to the calendar
  - Stores/people tick off steps with an optional note and photo/file; who and when
    are recorded automatically; steps can be reopened
  - Head Office sees progress on the post (complete / in progress / not started /
    overdue) and a *View progress* table with every step, note and photo, plus CSV export
  - Open tasks count in The Grind badge and on the dashboard
- Security rules: stores and people can only update their own copy of a task
- Deploys now also publish the Firestore and Storage security rules

## v1.3.1 — 2026-11-23
- **Fixed average completion time.** It now only counts requests with a real completion
  date, and leaves out impossible dates (before submission, in the future, or over a year)
- Smartsheet import: completed requests with no completion date no longer count as
  "0 days", and typo dates (e.g. year 3126) are ignored. Re-run the import to refresh
  already-imported requests
- The card now shows the YTD median and how many requests were left out

## v1.3.0 — 2026-11-23
- **Service Request dashboard** (Service Requests → *Dashboard*, Store Managers and up):
  brand / status / department / date filters with YTD, 30d, 90d, 1yr and All presets;
  totals, completion rate, in progress, new + on hold, and average completion time
  (YTD, 90 days, 30 days, excluding approval/warranty holds); weekly volume with spike
  weeks; status breakdown; by brand; monthly totals; by day of week; top categories;
  top stores; open-request aging with the oldest open requests (click to open)
- Everyone sees the requests they're allowed to see: Store Managers their store,
  DMs their district, Head Office and Admins everything

## v1.2.0 — 2026-11-23
- **Import from Smartsheet:** Admin → Service desk → *Import requests…* brings in the
  Maintenance Request Form export (open requests + last 12 months by default). Safe to
  re-run until cutover: matches on MR number, refreshes untouched requests, never duplicates
- Imported requests keep their MR number, store, category, status, notes, and the
  Ops / IT / troubleshooting updates in the activity timeline
- New categories for Smartsheet types: Signage, Internet / Phone, Fire & Life Safety,
  Appliances & Equipment, Pest Control, Cleaning, Other

## v1.1.0 — 2026-11-23
- Dashboard greeting follows the time of day (morning / afternoon / evening)
- 84 resource links connected to their real Smartsheet and Google Drive addresses
- Resource links open in a new tab
- Sign-in fixed on phones (Safari / Chrome on iPhone)
- Automatic deploys: every change on `main` goes live in about 2 minutes
- Version number shown in the portal footer and sign-in page

## v1.0.0 — 2026-11-23
- First live release on Firebase: Microsoft 365, Google and email-link sign-in;
  self sign-up with Admin approval; The Grind, calendar, resources, service
  requests, reports, fleet and admin, all on a shared database
