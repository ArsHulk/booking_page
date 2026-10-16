# Put Arsenios' Booking Page online

This setup uses GitHub for the website files and Cloudflare for the live website and database. The public site and admin dashboard are one application.

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

Check that `package.json`, `wrangler.jsonc`, `schema.sql`, `app`, `db`, and `drizzle` are visible at the top level of the repository.

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

Do not change the binding name `DB` or the database name.

## 4. Prepare the database tables

1. Return to **Cloudflare → D1 SQL database → arsenios-booking-db**.
2. Open the **Console** tab.
3. In GitHub, open `schema.sql` and copy all of its contents.
4. Paste the SQL into the Cloudflare console and select **Execute**.
5. Confirm that `booking_slots` and `admin_login_attempts` appear under **Tables**.

This is required only once for a new database.

## 5. Connect GitHub to Cloudflare Workers

1. Go to **Cloudflare → Workers & Pages**.
2. Select **Create application** and choose **GitHub**.
3. Authorize Cloudflare to access GitHub if asked.
4. Select your booking-page repository.
5. Set the Worker name to exactly `arsenios-booking-page`.
6. Use the `main` production branch.
7. Leave the root directory empty.
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

Edit or upload changed files in GitHub and commit them. Cloudflare will automatically rebuild and publish the new version from the `main` branch. Existing bookings remain in D1 and are not erased by code updates.

## Optional custom domain

The free `workers.dev` address is enough to use the site. If you own a domain, open the Worker's **Settings → Domains & Routes** and add a custom domain later.
