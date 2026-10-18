# Arsenios' Booking Page

A Cloudflare-hosted weekly drum lesson scheduler with a public booking calendar and a password-protected teacher dashboard.

## What students see

- A black, white, grey, and green weekly timetable on a subtle rugged background
- Green one-hour lessons that can be requested
- Privacy-safe taken lessons with no student names exposed
- 30-minute possible start times, including times such as 17:30
- A separate page for entering their name and email and submitting a request
- Immediate holding of a requested slot so nobody else can take it
- Mobile day tabs and swipe gestures
- Daily availability totals on phones and a weekly total on desktop
- A subtle today highlight, live current-time line, automatic refresh, and a return-to-today button
- An optional Save to phone control for adding the site to a home screen

## What the teacher sees

- A password login at `/admin/login`
- A weekly calendar showing each student's name
- White available slots, orange pending requests, and sage confirmed lessons at a glance
- Compact pending-request controls and a chronological confirmed-lessons list
- Click-to-add availability in 30-minute increments for one-hour lessons
- Remove or edit availability from the same calendar
- Approve or reject requests
- Cancel confirmed lessons and reopen the time
- Automatically email the student when a request is confirmed, rejected, or cancelled
- Download one confirmed lesson or the whole week as an `.ics` calendar file
- Mark confirmed lessons as completed
- Review completed lessons by month and clear them from the active list without deleting history
- A blank schedule for each new week until new availability is added

## Hosting

The application runs on Cloudflare Workers. Cloudflare D1 stores lesson availability, student names, student email addresses, booking status, and completion history. GitHub stores the code only; it never stores booking data, API keys, or the administrator password.

Follow [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) for the complete deployment instructions.

## Local development

Requires Node.js 22.13 or newer.

1. Copy `.dev.vars.example` to `.dev.vars` and enter a local password of at least 12 characters.
2. Keep the placeholder D1 ID in `wrangler.jsonc` for local use.
3. Install and initialize:

   ```bash
   npm install
   npm run db:migrate:local
   npm run dev
   ```

4. Verify a production build with:

   ```bash
   npm test
   ```

Never commit `.dev.vars`, `.env` files, or passwords.
