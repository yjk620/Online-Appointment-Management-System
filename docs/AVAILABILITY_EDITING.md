# Edit/remove availability (#11)

Provider home reuses the existing date/time form to edit a future open slot.
Remove asks for confirmation. Mutations refresh the list; clients see changes
on their next availability refresh. Errors preserve the form for retry.

- `PATCH /api/provider/availability/<id>` accepts `starts_at` with an ISO offset
  and keeps the existing 30-minute duration.
- `DELETE /api/provider/availability/<id>` accepts an empty JSON object.
- Both require a provider session and `X-Requested-With: AppointmentDesk`.
- Only the owner's future slots may change. Overlaps return 409.
- Any appointment history blocks edits/removal, even after cancellation. This
  preserves the date/time attached to recorded appointments; add a new slot
  instead. Active booked slots also disable the controls in the UI.
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
