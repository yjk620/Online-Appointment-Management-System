# Appointment management API

All routes require a signed-in session. Mutations require JSON and
`X-Requested-With: AppointmentDesk`. IDs in requests never determine the acting user.

| Method | Route | Role | Request / result |
| --- | --- | --- | --- |
| GET | `/api/provider/availability` | Provider | Own future slots, including `booked` flag |
| POST | `/api/provider/availability` | Provider | `starts_at`: future ISO timestamp with offset; creates a 30-minute slot |
| POST | `/api/appointments/<id>/cancel` | Client | Cancels own upcoming scheduled appointment, preserving its row |
| POST | `/api/appointments/<id>/reschedule` | Client | `availability_id`: another future free slot with the same provider |
| GET | `/api/provider/appointments` | Provider | Own appointments in ascending date/time order, including history and client details |
| PATCH | `/api/provider/appointments/<id>/status` | Provider | `status`: `completed` or `no-show`; only scheduled appointments whose start has passed |
| GET | `/api/appointments/history` | Client | Own appointments and current statuses, newest first |

Creation, cancellation and rescheduling already existed on main; this change adds
provider listing/status updates and client-visible history. Availability editing
and removal are tracked separately in #11. Provider UI integration is #13.

Errors: 400 invalid input/header, 401 signed out, 403 wrong role, 404 missing or
another user's record, 409 booking/transition conflict, 503 database busy.
Terminal statuses cannot be changed again. Cancellation frees the slot; completed
and no-show appointments retain their booking record. Status writes are serialized
with booking/rescheduling to prevent conflicting updates.
