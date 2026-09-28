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
