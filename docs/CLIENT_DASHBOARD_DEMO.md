# Client dashboard (#41)

Client home now shows the next scheduled appointment and upcoming count. Booking/history shortcuts open the existing sections. Booking, cancellation, rescheduling and Refresh overview refresh the summary.

Demo: sign in as a client, book a future slot, then reschedule or cancel it. Show the changing overview count and next time; use View appointment history to show retained records. With no bookings, the overview shows an empty state.

Run frontend tests with `cd frontend && npm test` (Node 22.6+). Existing role-restricted APIs are reused; no schema changes.
