# Add confirmation and rejection emails

Complete these steps in order. The live website continues working while you prepare the database and email settings.

## 1. Create the free Brevo account and sender

1. Create a free account at <https://www.brevo.com/>.
2. In Brevo, open **Settings → Senders, Domains & IPs → Senders**.
3. Select **Add a sender**.
4. Use `Arsenios` as the sender name and enter the email address you want students to see.
5. Enter the verification code Brevo sends to that address.
6. Keep the exact verified sender email address for step 4 below.

You can begin with an address you already own. If you later buy a domain, authenticate it in Brevo and change `EMAIL_FROM` to an address on that domain for better delivery.

## 2. Create the Brevo API key

1. In Brevo, open **Settings → SMTP & API → API Keys**.
2. Select **Generate a new API key**.
3. Name it `Arsenios Booking Page`.
4. Copy the key when Brevo displays it. Do not put it in GitHub.

## 3. Add the email column to D1

Do this before uploading the website update. Adding the nullable column does not disturb existing bookings.

1. Open **Cloudflare → D1 SQL database → arsenios-booking-db → Console**.
2. Open `email-migration.sql` from this update package.
3. Copy its `ALTER TABLE` command into the Cloudflare console.
4. Select **Execute** once.
5. Run `PRAGMA table_info(booking_slots);` and confirm `student_email` appears.

If Cloudflare says `duplicate column name: student_email`, the update was already applied and must not be run again.

## 4. Add two Cloudflare secrets

1. Open **Workers & Pages → arsenios-booking-page → Settings**.
2. Under **Runtime variables and secrets**, select **Add variable**.
3. Add `BREVO_API_KEY`, paste the Brevo API key, and enable **Secret**.
4. Add `EMAIL_FROM`, enter the exact verified sender email from Brevo, and enable **Secret**.
5. Apply them to **Production** and select **Add variable and deploy**.

The existing website ignores these new secrets until the code update is deployed.

## 5. Upload the website update to GitHub

Extract `arsenios-email-update.zip`. Replace or add each included file at the same path inside the existing `arsenios-booking-page-github` folder in GitHub. Commit all changes to `main`.

Do not replace `wrangler.jsonc`; it already contains the real D1 database ID.

Cloudflare should start a new Git build. Wait until it shows **Ready**.

## 6. Test without using a real student

1. Add a future availability slot in the admin page.
2. Open the public page in a private browser window.
3. Request that slot using your own name and email address.
4. Return to the admin page and approve it.
5. Check your inbox and the **Transactional → Logs** area in Brevo.
6. Create another test request and reject it to verify the second template.

No calendar file is attached. The email contains only the student's name, the result, the lesson time when relevant, and the contact phone number.
