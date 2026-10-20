# Provider appointment management (#13)

Requires the appointment API PR (#15). Provider home now has Upcoming and Past
and cancelled views, sorted by date/time. Each booking shows the client, email,
local start/end, status and confirmation number. Client home has collapsible
appointment history with a refresh action to see the latest provider outcome.

An outcome can be recorded once its start time has passed. Completed and No-show
require explicit confirmation and cannot be changed again. Cancelled records stay
visible. Providers cannot access another provider's bookings, including by calling
the API directly.

Manual checklist (record results when executed):

- Provider signs in and sees only their bookings; another provider sees a different list.
- Upcoming view is chronological; past/cancelled view retains cancelled bookings.
- Choose Mark completed or Mark no-show on a past scheduled appointment. Cancel
  the confirmation first, then confirm: only the confirmed action saves.
- Client refreshes Appointment history and sees the recorded outcome.
- Signed-out access redirects to login; fetch failure displays an error and refresh remains available.
- Repeat at desktop/mobile widths and with keyboard-only navigation.

Backend coverage is indexed in `docs/TEST_CASES.md`. This checklist does not claim
manual checks were executed.

## Recorded browser verification - October 19, 2026

Headless Chrome with disposable SQLite accounts: provider opens past bookings,
confirms Completed, and the client opens history to see Completed and Cancelled.
Passed. Desktop (1280px) and mobile (390px) screenshots inspected; no horizontal
overflow or browser page errors. The remaining manual checks above still require
execution, including keyboard-only navigation and explicit confirmation cancellation.
