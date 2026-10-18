# Install the calendar and completed-lessons update

This update adds the rugged public styling, privacy-safe taken slots, live calendar indicators, home-screen support, the admin overview lists, and completed lesson history.

It does not require a new service, secret, API key, or database. It adds two nullable columns to the existing `booking_slots` table.

## 1. Update the Cloudflare database first

Do this before uploading the website files so the live admin page always has the columns expected by the new code.

1. Open **Cloudflare → D1 SQL database → arsenios-booking-db → Console**.
2. Open `completion-migration.sql` from this update package.
3. Copy both `ALTER TABLE` lines into the Cloudflare console.
4. Select **Execute** once.
5. Run:

   ```sql
   PRAGMA table_info(booking_slots);
   ```

6. Confirm that `completed_at` and `cleared_at` appear.

If Cloudflare says either column already exists, do not run that `ALTER TABLE` command again.

## 2. Upload the update to GitHub

1. Extract the supplied update ZIP.
2. In GitHub, open the existing application folder—the same folder containing `app`, `db`, `lib`, and `package.json`.
3. Select **Add file → Upload files**.
4. Drag the extracted files and folders into the upload area.
5. Check that the preview paths begin with paths such as `app/`, `db/`, `lib/`, and `public/`. They must not begin with the name of the extracted ZIP folder.
6. Commit all files together to `main`.

GitHub replaces matching files by their full path and adds the new files. Do not upload the ZIP itself.

This package does not replace `wrangler.jsonc`, so the live D1 database ID remains unchanged.

## 3. Wait for Cloudflare

The GitHub commit should start a new Cloudflare build automatically. Wait for the deployment to show **Ready**, then refresh the live website.

## 4. Test the update

1. Open the public site and confirm the availability total, Today button, and rugged background appear.
2. Confirm a requested or confirmed lesson appears as `Taken` without a student name.
3. Open `/admin` and confirm the pending and confirmed overview lists appear.
4. Click a confirmed student lesson and select **Mark completed**.
5. Open **Completed lessons** in the admin navigation.
6. Select **Clear from list**, then enable **Show cleared history** and confirm the lesson still exists.
7. Test both **Download week** and the individual **Calendar invite** link.

## Home-screen behavior

- On supported Chrome and Android browsers, **Save to phone** opens the installation prompt.
- On iPhone and iPad, Safari does not permit websites to trigger installation directly. The button displays the correct **Share → Add to Home Screen** instruction.
- The saved site opens in a standalone app-like window, but it still needs an internet connection to load live availability.
