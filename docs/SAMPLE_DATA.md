# Sample data (#70)

The database (`backend/appointments.db`) is not in the repository, so a fresh clone
starts empty. One command fills it with sample data for every page.

## Commands

In the `backend` folder (Windows PowerShell):

```powershell
.\.venv\Scripts\python.exe -m flask --app app sample seed     # add or refresh
.\.venv\Scripts\python.exe -m flask --app app sample remove   # delete
```

On macOS or Linux, use `.venv/bin/python -m flask --app app sample seed`.

- Times are relative to now. Run `seed` again whenever the data looks stale, for
  example after marking outcomes or approving applications.
- `seed` and `remove` only touch accounts ending in `@edge.example.invalid` and
  their rows. Your own accounts and bookings are kept.
- For local testing only. Don't run it against a shared or real database.

## Signing in

| Page | Email | Password |
|---|---|---|
| Provider | `provider@edge.example.invalid` (Morgan Edge) | `password123` |
| Client | `casey@edge.example.invalid`, `avery@…`, `zoe@…`, `dana@…` | `password123` |
| Admin | Your own admin: `flask --app app admin create` | Your choice |

The sample admin (Rae Second-Admin) has a random password, so nobody can sign in
as it. It is only there to show the Admin tag in the user list.

## What it covers

**Provider page (Morgan Edge)**
- Needs an outcome: ended minutes ago, yesterday, and over a week overdue (long name)
- Now: an appointment in progress, and one starting right after it (two Next cards)
- Later: back-to-back tomorrow, rebooked after a cancellation, ending at midnight,
  two weeks out, next year, and the night the clocks spring forward
- History: completed, no-show and cancelled, including last month and last year
- Availability: open slots with only cancelled bookings (editable, #64), a past open
  slot that must not show, and a full morning of open slots

**Client page**
- Clients with accented, apostrophe and very long names, each with upcoming
  appointments and history in different statuses

**Admin page**
- Provider applications from last year (date shows the year), last week and a minute
  ago, with accented, very long, and `%` / `_` names (search must treat them literally)
- Every role tag: Client, Provider, Admin and Pending
- 8 extra clients and a second provider (Sam Rivers), so the user list needs Show more
- 11 no-shows, so the no-show filter needs Show more
- Two providers booked on the same morning, for the date filter
