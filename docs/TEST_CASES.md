# Consolidated test cases

This is the test-case index for the prototype. Automated tests remain grouped by
feature in `backend/tests`; consolidation means one place to find the cases,
expected behaviour, requirement coverage and execution instructions, not one huge
test file. A passing API suite does not establish that manual UI checks passed.

## Run automated tests

From `backend`, with requirements installed:

```sh
python -m unittest discover -s tests -v
```

Each test uses a temporary SQLite database. No real accounts or bookings are used.

| Case group | Issue | Action / expected result | Automated evidence |
| --- | --- | --- | --- |
| Registration | #1, #27 | Submit valid/invalid account details; correct role/pending approval, validation and duplicate handling | `test_registration.py`, `test_account_types.py` |
| Authentication | #3, #4 | Sign in/out and access protected routes; reject invalid credentials and unauthorized roles | `test_login.py`, `test_account_types.py` |
| Admin approvals | #4 | Approve provider applications; restrict approval actions to admins | `test_admin.py` |
| Providers | #5, #22 | Read/seed profiles; correct provider data and repeatable seeds | `test_providers.py` |
| Booking | #6, #7 | Book available slot; reject past/missing/taken slots, exactly one concurrent winner | `test_booking.py` |
| Upcoming appointments | #8 | Read own future scheduled bookings in order; exclude other clients and terminal/past records | `test_upcoming.py` |
| Availability creation | #10, #15 | Add future 30-minute slot; reject overlap, invalid timestamps and unauthorized users | `test_availability.py` |
| Availability editing | #11 | Edit/remove unused future slots; reject unauthorized users, overlaps and history changes; booking/removal race has one winner | `test_availability_editing.py` (availability PR #38) |
| Cancel/reschedule | #12, #15 | Change own upcoming scheduled booking; preserve cancellation history and reject occupied/cross-provider targets | `test_modification.py` |
| Provider appointments | #13, #15 | List only own appointments in time order with client details | `test_appointment_management.py::test_provider_list_and_client_history_are_isolated` |
| Outcomes/history | #13, #15 | Record Completed/No-show; expose status to client, retain cancelled rows; reject invalid/terminal/future updates | `test_appointment_management.py` |
| Setup | #9 | Health endpoint and schema initialization work | `test_setup.py` |

## Manual acceptance checks (not yet executed)

Use separate browser sessions for two clients and two approved providers. Create
future slots plus one past scheduled appointment in a disposable test database.

| ID | Steps | Expected result |
| --- | --- | --- |
| M01 | Client registers, logs in, selects provider/time, books | Confirmation appears; slot is unavailable to another client |
| M02 | Client reschedules, then cancels | New time appears; cancelled row remains recorded and slot becomes bookable |
| M03 | Provider views appointment screen and refreshes | Own bookings show client, date/time and status in order; another provider's do not appear |
| M04 | Mark a past scheduled appointment Completed, another No-show; refresh client history | Updated statuses appear for both users; cancelled records remain unchanged |
| M05 | Provider edits/removes an open slot, then tries a booked slot | Open slot changes appear to clients; booked slot changes are blocked (#11) |
| M06 | Repeat provider workflows on narrow/mobile viewport and with keyboard | Controls have labels, focus is usable, messages are readable, layout does not overflow |

Record date, tester, build/commit, pass/fail and any defect link when these manual
cases are run. Browser acceptance results must not be inferred from API tests.

## Verification snapshot - October 19, 2026

- API branch: 61 automated tests passed.
- Availability branch (#38): 60 automated tests passed.
- Temporary combined branch (#37, #38, #39): 66 automated tests and the production
  TypeScript/Vite build passed, with no merge conflicts.
- Headless Chrome with disposable accounts: provider confirms Completed, client
  sees Completed/Cancelled history, provider edits and removes an unused slot.
  These flows passed. Desktop/mobile overflow checks and browser page-error checks passed.
- Manual keyboard-only navigation, the complete end-to-end acceptance checklist,
  and a deployment smoke test remain unexecuted.
