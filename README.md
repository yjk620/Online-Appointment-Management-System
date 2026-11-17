# Online Appointment Management System

A CPS714 prototype for booking appointments, built with React, TypeScript, Flask and SQLite.

- **Clients** find a provider, book an open time, and reschedule, cancel or review past appointments.
- **Providers** add, edit and remove 30-minute open times, see what's next, and mark appointments completed or no-show.
- **Admins** approve or reject provider applications, see appointment totals and the appointments behind them, and search users.

Anyone can register as a client. Provider accounts wait for an admin's approval. Admin accounts can only be created from the server's command line.

## Run locally

You need Python 3.12 and Node.js 22.12 or newer. Run the backend and frontend in two terminals.

**Backend**, from the `backend` folder:

```powershell
# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m flask --app app run --debug
```

```bash
# macOS / Linux
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/flask --app app run --debug
```

Only the first two lines are one-time setup. `--debug` restarts the server when backend code changes; use it on your own computer only.

**Frontend**, from the `frontend` folder:

```bash
npm install
npm run dev
```

Open http://localhost:5173. Port 5000 is only the API: Vite forwards `/api` requests to it.

## Accounts and sample data

The database (`backend/appointments.db`) is created on first start and is not in the repository, so a fresh clone starts empty. Run these from the `backend` folder (shown for Windows; on macOS or Linux use `.venv/bin/flask` in place of `.\.venv\Scripts\python.exe -m flask`):

| Command | What it does |
| --- | --- |
| `.\.venv\Scripts\python.exe -m flask --app app admin create` | Creates an admin account. It asks for a name, email and password |
| `.\.venv\Scripts\python.exe -m flask --app app sample seed` | Adds sample clients, providers, appointments and applications covering every edge case. Run it again to refresh the times. Local testing only |
| `.\.venv\Scripts\python.exe -m flask --app app sample remove` | Deletes the sample data and keeps everything else |

Sample accounts sign in with `password123`, for example `provider@edge.example.invalid` or `casey@edge.example.invalid`. [docs/SAMPLE_DATA.md](docs/SAMPLE_DATA.md) lists what each one covers.

## Tests

```bash
cd backend && python -m unittest discover -s tests   # use the .venv Python
cd frontend && npm test
```

Manual acceptance checks are in [docs/TEST_CASES.md](docs/TEST_CASES.md).

## Deploy (Railway)

The `Dockerfile` builds the React site and serves it with the API from one address (`backend/serve.py`, run by gunicorn). Railway builds it from `railway.json` and checks `/api/health`. The service needs:

- A volume. The database lives on it, so data survives redeploys.
- `APPOINTMENTS_SECRET_KEY` set to a long random value, so restarts don't sign everyone out.

The server refuses to start without either. Create the first admin from Railway's shell with `flask admin create`; `flask providers seed-demo` adds four demo providers. Don't run `sample seed` there: its accounts have a published password.

## Project layout

| Path | Contents |
| --- | --- |
| `backend/app.py` | App setup, registration and sign-in |
| `backend/booking.py` | Booking options, booking, cancelling and rescheduling (clients) |
| `backend/availability.py` | Open times (providers) |
| `backend/appointment_management.py` | Provider appointments and outcomes, client history |
| `backend/admin.py` | Provider applications, totals, appointments and users (admins) |
| `backend/sample_data.py` | `sample seed` / `sample remove` |
| `backend/schema.sql` | Database tables |
| `frontend/src/App.tsx` | Sign-in, registration and each role's home page |
| `frontend/src/dashboard.ts` | Shared date, filter and status helpers |
| `docs/API.md` | Every API route, with roles and rules |
