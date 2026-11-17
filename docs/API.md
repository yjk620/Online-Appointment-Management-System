# API

Every route lives under `/api`. Requests that change data must send JSON with the
header `X-Requested-With: AppointmentDesk`; together they block cross-site form
submissions. The acting user always comes from the session, never from IDs in the
request. Responses are not cached.

Timestamps are ISO 8601 with an explicit offset and are stored in UTC. The browser
shows them in the viewer's local time zone.

## Accounts

| Method | Route | Who | Request / result |
| --- | --- | --- | --- |
| GET | `/api/health` | Anyone | `{"status": "ok", "database": "ok"}`; used by Railway's health check |
| POST | `/api/register` | Anyone | `name`, `email`, `password` (8+ characters), `account_type`: `client` or `provider`. Providers wait for approval |
| POST | `/api/login` | Anyone | `email`, `password`. Pending providers can't sign in |
| GET | `/api/session` | Signed in | The current user, or 401 |
| POST | `/api/logout` | Signed in | Ends the session |

## Clients

| Method | Route | Request / result |
| --- | --- | --- |
| GET | `/api/booking/options` | Approved providers and their future open times |
| POST | `/api/appointments` | `availability_id`: books a future open time |
| GET | `/api/appointments` | Own upcoming scheduled appointments, soonest first |
| POST | `/api/appointments/<id>/cancel` | Cancels own upcoming appointment; the row stays as history and the time opens up again |
| POST | `/api/appointments/<id>/reschedule` | `availability_id`: another open time with the same provider. The confirmation number stays the same |
| GET | `/api/appointments/history` | Own appointments in every status, newest first |

## Providers

| Method | Route | Request / result |
| --- | --- | --- |
| GET | `/api/provider/availability` | Own future open times, each with a `booked` flag |
| POST | `/api/provider/availability` | `starts_at`: a future start on the hour or half hour; creates a 30-minute slot |
| PATCH | `/api/provider/availability/<id>` | `starts_at`: moves an open slot. Rules in [AVAILABILITY_EDITING.md](AVAILABILITY_EDITING.md) |
| DELETE | `/api/provider/availability/<id>` | Removes an open slot |
| GET | `/api/provider/appointments` | Own appointments in every status, with client details, oldest first |
| PATCH | `/api/provider/appointments/<id>/status` | `status`: `completed` or `no-show`, once the appointment has started. Can't be changed afterwards |

## Admins

| Method | Route | Request / result |
| --- | --- | --- |
| GET | `/api/admin/provider-applications` | Pending provider applications, oldest first |
| POST | `/api/admin/provider-applications/<id>/approve` | Approves the provider so they can sign in |
| POST | `/api/admin/provider-applications/<id>/reject` | Deletes the pending account |
| GET | `/api/admin/summary` | Counts of clients, approved providers, pending applications and appointments per status |
| GET | `/api/admin/appointments` | Every appointment with client and provider names, newest first |
| GET | `/api/admin/users` | Every account (never password hashes); optional `q` (name or email) and `role` filters |

## Errors

400 invalid input or missing header, 401 signed out, 403 wrong role, 404 missing or
another user's record, 409 conflict (time taken, overlapping slot, appointment
already finished), 503 database busy. Errors return `{"error": "message"}`.

Booking, rescheduling, outcomes and slot changes run in transactions, and a unique
index stops two active bookings of one slot, so two requests can't double-book.
