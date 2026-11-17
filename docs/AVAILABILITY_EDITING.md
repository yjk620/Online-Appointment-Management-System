# Edit/remove availability (#11)

Your availability lists future slots grouped by day. Edit loads a slot into the
date/time form (the form names the slot being edited and the row is highlighted);
Remove asks for confirmation in the row: Edit / Remove become a red Remove and Keep. Booked rows show the client's name.
Mutations refresh the list; clients see changes on their next reload. Errors
preserve the form for retry.

- `PATCH /api/provider/availability/<id>` accepts `starts_at` with an ISO offset
  and keeps the existing 30-minute duration.
- `DELETE /api/provider/availability/<id>` accepts an empty JSON object.
- Both require a provider session and `X-Requested-With: AppointmentDesk`.
- Only the owner's future slots may change. Overlaps return 409.
- Start times must be on the hour or half hour (checked in UTC; 400 otherwise).
  The start time picker steps in 30 minutes.
- Booked slots (any booking that isn't cancelled) can't be edited or removed (409);
  the UI shows the client's name instead of Edit/Remove.
- Open slots whose only bookings were cancelled can be edited and removed (#64).
  Those bookings still point at the slot, so the row is kept and marked with
  `removed_at` instead: removing hides it, and editing hides it and puts the new
  time in a new slot. Cancelled bookings keep their original date and time in
  every history. Hidden slots are left out of the provider's list, booking
  options, booking, rescheduling and overlap checks. Adding or moving a slot to a
  hidden slot's exact time brings that row back, since a provider has one row per
  start time. Databases created before #64 gain the `removed_at` column on startup.
- Transactions serialize checks and mutations against bookings.

Run: `cd backend && python -m unittest discover -s tests -v`.
`test_availability_editing.py` covers edits, removal, ownership, role checks,
invalid/past and off-half-hour times, overlap rejection, client-visible changes,
removing and editing slots with cancelled bookings, and the `removed_at` migration.

Manual checks: edit and remove an unused slot; confirm a client refresh reflects
the change. Attempt a booked slot, a past slot and another provider's slot and
verify rejection. Check Cancel editing and Remove confirmation with keyboard and
at mobile width. Record results separately; these checks are not yet marked passed.

## Recorded browser verification - October 19, 2026

Headless Chrome with disposable SQLite data: edit an unused slot, observe the
updated time, confirm removal, observe the removed message. Passed. Desktop
(1280px) and mobile (390px) screenshots inspected; no horizontal overflow or
browser page errors. Remaining manual checks, including keyboard-only navigation,
are not claimed as passed.
