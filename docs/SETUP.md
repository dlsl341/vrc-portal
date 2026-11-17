# Setting up the VRC Rowing Portal on Firebase

This takes about an hour, start to finish, and you only do it once. Everything happens in your
web browser – no software to install. Do the steps in order.

You'll need: the club's Google account that owns the Firebase project **vrc-rower-s-portal**,
access to the **dlsl341/vrc-portal** GitHub repository, and a payment card.

---

## 1. Switch the project to the pay-as-you-go plan

Photo storage (damage reports, profile photos) requires Firebase's **Blaze** plan. For a club this
size the cost should be very small, often nothing, but set a budget alert so there are no surprises.

1. Open the [Firebase console](https://console.firebase.google.com/) → **vrc-rower-s-portal**.
2. Bottom-left, next to "Spark", click **Upgrade** → choose **Blaze** → add the payment card.
3. When asked, set a **budget alert** (for example $10/month). Alerts email you; they don't stop the site.

## 2. Turn on sign-in

1. Left menu → **Build → Authentication** → **Get started**.
2. **Sign-in method** tab:
   - **Google** → Enable → choose a support email → Save.
   - **Add new provider → Email/Password** → switch on **Email/Password** (required first) and
     **Email link (passwordless sign-in)** → Save. Nobody gets a password – the portal only offers
     Google and the emailed link.

## 3. Create the database

1. **Build → Firestore Database** → **Create database**. If asked for an edition, choose **Standard**.
2. Location: **northamerica-northeast1 (Montréal)** keeps the club's data in Canada.
   ⚠️ The location can't be changed later.
3. Choose **Start in production mode** → Create. (The portal's own rules replace the defaults on first deploy.)

## 4. Create photo storage

1. **Build → Storage** → **Get started**.
2. Location: **northamerica-northeast1 (Montréal)** keeps photos in Canada (small storage cost);
   US regions such as us-west1 fall under Firebase's free allowance. Can't be changed later.
3. Production mode → Create.

## 5. Let GitHub deploy the portal

GitHub needs a key so it can publish the portal and its security rules for you.

**5a. Create the key**
1. Firebase console → ⚙️ **Project settings** → **Service accounts** tab.
2. Click **Generate new private key** → **Generate key**. A `.json` file downloads.
   Treat it like a password: don't email it or put it in the repository.

**5b. Give the key permission to deploy**
1. Open [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam?project=vrc-rower-s-portal).
2. Find the account whose name starts with **firebase-adminsdk-** → click the ✏️ pencil.
3. **Add another role** → **Firebase Admin**. **Add another role** → **Service Usage Consumer**. → **Save**.

**5c. Store the key in GitHub**
1. On GitHub open **dlsl341/vrc-portal** → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** → Name: `FIREBASE_SERVICE_ACCOUNT` → Secret: open the downloaded
   `.json` file in a text editor, copy **everything**, paste → **Add secret**.
3. Delete the downloaded `.json` file from your computer.

## 6. Publish the portal

1. On GitHub, open the **Pull requests** tab and open the pull request Claude created.
2. Wait for the checks to go green (about 3 minutes). A **preview link** appears in a comment –
   open it to look around (you can sign in, but it's best to do the owner step on the live site).
3. Click **Merge pull request** → **Confirm**. GitHub tests and deploys automatically (**Actions** tab shows progress).
4. The portal is live at **https://vrc-rower-s-portal.web.app**.

## 7. Become the owner – do this straight away

1. Open https://vrc-rower-s-portal.web.app and sign in (Google or email link).
2. You'll see **Set up the portal** → **Make me the owner**.
   The first person to do this becomes the owner, so do it right after the first deploy.

## 8. Bring the club's data across

1. In the **original portal on claude.ai**: **Programs → Manage programs → Export all data**.
   Save the file.
2. In the **new portal**: **Programs → Manage programs → Import data** → choose the file →
   **Import**. Boats, members, programs, bookings, history and photos come across.
3. Sign-in accounts don't carry over. Go to **My profile**, find yourself and send the request,
   then approve it yourself on the **Members** page.

Tip: do a test import first, look around, and re-import with a fresh export on switchover day –
re-importing replaces records with the same ID, so nothing is duplicated.

## 9. Add admins and invite members

- **Admins:** Members page → **Club admins → + Add admin**. If they've already linked their
  profile, their admin tools appear next time they open the portal; otherwise as soon as you
  approve their profile request.
- **Members:** send everyone the link. They sign in, find their name under **My profile**, and an
  admin approves them. Until then they only see that screen.

## 10. Optional: use the club's own web address

1. Firebase console → **Hosting** → **Add custom domain** → e.g. `portal.vancouverrowingclub.ca`.
2. Firebase shows one or two DNS records; whoever manages the club's domain adds them.
3. **Authentication → Settings → Authorized domains** → **Add domain** → the same address
   (otherwise sign-in won't work there).

---

## If something goes wrong

| Problem | Fix |
|---|---|
| GitHub "Deploy to live" fails with *permission denied* | Re-check step 5b – both roles must be on the **firebase-adminsdk-** account. |
| GitHub check fails with *FIREBASE_SERVICE_ACCOUNT* empty | Re-do step 5c; the secret name must match exactly. |
| Sign-in link email doesn't arrive | Check spam/junk. The sender is noreply@vrc-rower-s-portal.firebaseapp.com. |
| "Couldn't send the link" | Step 2: Email link sign-in must be enabled. |
| Sign-in fails on a custom domain | Step 10.3: add the domain to Authorized domains. |
| Photos won't upload | Step 1 (Blaze plan) and step 4 (Storage created). |
| Someone else became owner by mistake | Firebase console → Firestore → `config` → `settings` → change `ownerUid` to your account's ID (found under Authentication → Users). |
