# Put Arsenios' Booking Page online

This setup uses GitHub for the website files and Cloudflare for the live website and database. The public site and admin dashboard are one application.

> **The live site is already set up.** This guide is for rebuilding from scratch. In the `ArsHulk/booking_page` repository the app lives in the `arsenios-booking-page-github/` folder, not at the top level, and Cloudflare's root directory must be set to that folder.

## Before you begin

You need:

- A free GitHub account and an empty repository
- A free Cloudflare account
- The ZIP supplied with this project

Do not put the administrator password in GitHub. It will be added directly to Cloudflare as an encrypted secret.

## 1. Upload the project to GitHub

1. Download and extract `arsenios-booking-page-github.zip`.
2. Open your empty GitHub repository.
3. Select **Add file → Upload files**.
4. Drag every extracted file and folder into the upload area. Upload the contents of the folder, not another ZIP file.
5. Select **Commit changes**.

Check that `package.json`, `wrangler.jsonc`, `schema.sql`, `app`, `db`, and `drizzle` are all inside the same app folder (in this repository, `arsenios-booking-page-github/`). Never create a second copy of `app`, `lib` or `tests` at the top level of the repository, and never upload files named like `route 2.ts` or folders like `app 2`. GitHub only replaces a file when the full path matches exactly.

## 2. Create the Cloudflare database

1. Open the Cloudflare dashboard.
2. Go to **Workers & Pages → D1 SQL database**.
3. Select **Create database**.
4. Name it exactly `arsenios-booking-db` and create it.
5. Copy the database ID shown on the database page.

## 3. Put the database ID into GitHub

1. In GitHub, open `wrangler.jsonc`.
2. Select the pencil icon to edit it.
3. Find this placeholder:

   ```text
   00000000-0000-4000-8000-000000000000
   ```

4. Replace only that value with the database ID copied from Cloudflare.
5. Commit the change.

The current repository already contains the live database ID. Change it only if you are deliberately moving to a new database.

Do not change the binding name `DB` or the database name.

## 4. Prepare the database tables

1. Return to **Cloudflare → D1 SQL database → arsenios-booking-db**.
2. Open the **Console** tab.
3. In GitHub, open `schema.sql` and copy all of its contents.
4. Paste the SQL into the Cloudflare console and select **Execute**.
5. Confirm that `booking_slots`, `admin_login_attempts` and `student_notes` appear under **Tables**. The console does not list them automatically; open **Tables** or run `SELECT name FROM sqlite_master WHERE type='table';`.

This is required only once for a new database. Never run `schema.sql` or `npm run db:migrate:remote` again on a database that already has bookings.

## 5. Connect GitHub to Cloudflare Workers

1. Go to **Cloudflare → Workers & Pages**.
2. Select **Create application** and choose **GitHub**.
3. Authorize Cloudflare to access GitHub if asked.
4. Select your booking-page repository.
5. Set the Worker name to exactly `arsenios-booking-page`.
6. Use the `main` production branch.
7. Set the root directory to the app folder: `arsenios-booking-page-github`. If this is left empty, the build fails with `package.json` not found.
8. Set the build command to:

   ```text
   npm run build
   ```

9. Set the deploy command to:

   ```text
   npx wrangler deploy
   ```

10. Select **Save and Deploy** and wait for the build to finish.

Cloudflare will give you a public address similar to `arsenios-booking-page.<account>.workers.dev`.

## 6. Add the private admin password

1. Open **Workers & Pages → arsenios-booking-page → Settings**.
2. Open **Variables and Secrets**.
3. Select **Add**.
4. Choose **Secret**, not plain text.
5. Use the variable name `ADMIN_PASSWORD`.
6. Enter your administrator password as the value.
7. Select **Deploy** to activate it.

The password is encrypted by Cloudflare and is not stored in GitHub. It must contain at least 12 characters.

Email also needs three more secrets, added the same way: `BREVO_API_KEY`, `EMAIL_FROM` (must exactly match a verified Brevo sender) and `ADMIN_NOTIFICATION_EMAIL`. See `EMAIL_SETUP.md` and `ADMIN_NOTIFICATION_SETUP.md`.

Always use **Deploy** (or **Save and deploy**), not only **Save version**, and check under **Deployments** that the new version receives 100% of traffic. Changing `ADMIN_PASSWORD` signs out every existing admin session.

## 7. Test the complete flow

1. Open the Cloudflare `workers.dev` URL. This is the public student timetable.
2. Select **Admin** at the bottom of the calendar, or add `/admin` to the URL.
3. Sign in and click an empty half-hour line to add a one-hour lesson.
4. Open the public page in a private/incognito browser window.
5. Select the green lesson, enter a test student name, and submit it.
6. Return to the admin page. The request should show the name and a pending status.
7. Approve it. It becomes confirmed and remains unavailable publicly.
8. Try **Calendar invite** to download the confirmed lesson.
9. Reject or cancel the test booking. The slot becomes green and bookable again.

## Updating the website later

Changes are made through pull requests: review **Files changed**, then merge. If you upload files by hand, open the `arsenios-booking-page-github` folder in GitHub first so every path starts with `app/`, `lib/`, `tests/` and so on. Cloudflare will automatically rebuild and publish the new version from the `main` branch. Existing bookings remain in D1 and are not erased by code updates, and deployments never run database migrations.

## Optional custom domain

The free `workers.dev` address is enough to use the site. If you own a domain, open the Worker's **Settings → Domains & Routes** and add a custom domain later.
