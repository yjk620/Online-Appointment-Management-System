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
- Any appointment history blocks edits/removal, even after cancellation. This
  preserves the date/time attached to recorded appointments; add a new slot
  instead. The UI hides Edit/Remove on these slots: booked rows show the client,
  and open slots with a cancelled booking read "Open · Locked" with a lock icon, and a note under the list explains why. The start time picker steps in 30 minutes.
- Transactions serialize checks and mutations against bookings.

Run: `cd backend && python -m unittest discover -s tests -v`.
`test_availability_editing.py` covers edits, removal, ownership, role checks,
invalid/past times, overlap rejection, client-visible changes and history safety.

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
