# Online Appointment Management System

CPS714 prototype using React, TypeScript, Flask, and SQLite.

## Run locally

Backend (Python 3):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app app run
```

Frontend (Node.js 22 or newer), in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The page checks `/api/health` through Vite's local proxy. Flask creates `backend/appointments.db` with the initial schema on startup.

To run the backend setup test: `cd backend && python -m unittest discover -s tests`.

## Login

Register at `/`, then sign in at `/login`. Signed-in users are sent to `/client`,
`/provider`, or `/admin` according to their stored role. These are basic welcome
pages; feature permissions and appointment screens are separate work.

The API provides `POST /api/login`, `GET /api/session`, and `POST /api/logout`.
Login and logout require JSON and the `X-Requested-With: AppointmentDesk` header.
The frontend sends both through the same-origin Vite proxy.

Run all backend tests with `cd backend && python -m unittest discover -s tests`.

## Book an appointment (#7)

Sign in as a client and select a provider and time on Client home. The confirmation
shows the provider, time, status and appointment ID. Booked times disappear. If
another client books the selected slot first, refresh and choose another time.
Times are displayed in the browser's local timezone. Store availability as ISO 8601
with an explicit offset; existing naive timestamps are treated as UTC.

`GET /api/booking/options` supplies the minimal provider/slot choices for this form.
`POST /api/appointments` accepts `{"availability_id": 1}` with JSON content type and
`X-Requested-With: AppointmentDesk`. The client ID comes only from the session.
Both routes require a signed-in client. Missing slots return 404; past or booked
slots return 409. SQLite transactions and the existing unique active-slot index
prevent concurrent double booking. These endpoints are independent of #4–#6;
full provider browsing, availability management and upcoming-appointment lists
remain separate issues.

### Run on Windows (PowerShell)

In a terminal in the backend folder (Python dependencies installed):

```powershell
.\.venv\Scripts\python.exe -m flask --app app booking seed-demo
.\.venv\Scripts\python.exe -m flask --app app run
```

The optional seed adds two demo providers and four slots for tomorrow, with random
unpublished provider passwords. It preserves existing data and bookings. Do not use
it for production provisioning. Repeating it on the same day does not duplicate slots.

In a second terminal in the frontend folder, using Node 22.12+:

```powershell
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173, register a client or sign in, and book a slot. Port 5000
is the API, not the website. Keep both terminals running. Stop Flask with Ctrl+C
before restarting after backend edits. On environments where Vite's config bundler
is restricted, append `--configLoader native` to the Vite build/preview command
using Node 24. A backend restart may require signing in again.

## Integration notes for issues #4, #5 and #6

- #4: booking currently uses `client_only` to check the current database account.
  When merging the approval workflow, replace this guard with its shared
  `require_roles("client")` guard and use `g.user["id"]` instead of `g.client`.
  Register the shared user loader before protected endpoints are called. A pending
  or rejected advisor retains role `client` in that implementation, so checking role
  alone is insufficient. Add tests denying booking/options for both statuses.
  Preserve blueprint registration in app.py and the Booking component in Client home
  when resolving the overlapping changes in App.tsx, app.py and this README.
- #5: reuse provider IDs (`users.id`), names and descriptions from
  `/api/booking/options`. This is a minimal booking selector, not a complete provider
  directory. Build richer details on provider_profiles; do not duplicate accounts or
  create another booking endpoint. Only users with role provider and a profile appear.
- #6: reuse availability IDs, provider_id, starts_at and ends_at. The calendar already
  groups slots by the browser's local date. Send ISO 8601 timestamps with explicit
  offsets (prefer UTC); avoid mixing naive local timestamps with UTC. Preserve the
  active-appointment exclusion and unique active-slot index. The booking endpoint
  remains the authority if a displayed slot becomes unavailable.
- Future availability writers must validate real timestamps and reject overlapping
  intervals for a provider. The current constraint prevents booking the same slot
  twice, but does not prevent two separately created overlapping slots. Availability
  editing and overlap validation belong with availability management.
- `GET /api/appointments` can be added for #8 alongside the existing POST route;
  filter by the authenticated client's ID on the server.

The calendar can navigate forward through empty months. Previous navigation stops
at the current local month. Changing provider/month/date clears the chosen slot;
selecting a time shows a review summary before the POST is submitted. Dates with
no available slots remain disabled. An empty month shows a clear empty state.
