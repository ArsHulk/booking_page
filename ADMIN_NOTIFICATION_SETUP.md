# New booking notification setup

This update sends Arsenios an email as soon as a student successfully requests an available lesson. It uses the Brevo connection that is already configured.

The booking remains safely recorded if Brevo is temporarily unavailable. The notification failure does not return the slot to the public timetable.

## 1. Add the notification email in Cloudflare

1. Open **Cloudflare → Workers & Pages → arsenios-booking-page → Settings**.
2. Find **Runtime variables and secrets** under the **Production** environment.
3. Select **Add variable**.
4. Enter `ADMIN_NOTIFICATION_EMAIL` as the variable name.
5. Enter the inbox that should receive new booking notifications.
6. Enable **Secret** if Cloudflare offers the option.
7. Select **Add variable and deploy** or **Save and deploy**.

This may be the same address already used for `EMAIL_FROM`, provided you receive email at that address.

Do not add the email address to GitHub and do not change `BREVO_API_KEY`, `EMAIL_FROM`, `ADMIN_PASSWORD`, or the D1 binding.

## 2. Upload the v5 package to GitHub

1. Extract `arsenios-booking-mega-update-2026-10-19-v5.zip`.
2. Open `ArsHulk/booking_page` in GitHub.
3. Enter the `arsenios-booking-page-github` folder.
4. Select **Add file → Upload files**.
5. Open the extracted v5 folder and drag in `app`, `lib`, `tests`, `.dev.vars.example`, and `ADMIN_NOTIFICATION_SETUP.md`.
6. Commit the changes to `main`.
7. Wait for the connected Cloudflare deployment to show **Ready**.

No SQL or D1 migration is required.

## 3. Test the notification

1. Add one future availability slot in admin.
2. Open the public booking page in a private browser window.
3. Request the slot using your own first name and email.
4. Check the inbox configured as `ADMIN_NOTIFICATION_EMAIL`.
5. Open the message and confirm it shows the student's name, email, date, time, and a link to `/admin`.
6. Select **Reply** and confirm the reply is addressed to the student's email.

The student does not receive a new email at the request stage. Their existing accepted, rejected, and cancelled emails continue working as before.
