# Client dashboard (#41, simplified in #60)

Client home greets the client ("Hi, Jamie.") and names the time zone. The next scheduled appointment is a card with provider, date and time range, how far away it is, and Reschedule/Cancel buttons. Later appointments are listed below (open when there are one or two, collapsed at three or more), then a single Book an appointment section, then collapsed Appointment history. On wide screens booking sits in a right-hand column. The account email and a Sign out link are in the header.

Data reloads after booking, cancelling or rescheduling and whenever the tab regains focus; a Retry button appears only when a load fails.

Demo: sign in as a client, book a future slot, then reschedule or cancel it from the next-appointment card and show the card update. Open Appointment history to show retained records. With no bookings, the card shows an empty state.

Run frontend tests with `cd frontend && npm test` (Node 22.6+). Existing role-restricted APIs are reused; no schema changes.
