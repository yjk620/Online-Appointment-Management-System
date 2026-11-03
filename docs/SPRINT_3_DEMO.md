# Sprint 3 demo guide

## Added in this change

- #41: Client overview shows upcoming scheduled count and the next provider/time.
  Booking and history shortcuts open their existing sections. Booking, cancellation,
  rescheduling and Refresh overview update the summary; empty/error states are explicit.
- #42: Provider schedule overview shows scheduled appointments today, future scheduled
  count and unbooked future slot count. View today, date/status filters, All appointments
  and Clear appointment filters reuse existing appointments. Outcomes and availability
  management remain available, with summaries refreshed after changes.
- #45: Provider directory searches names/descriptions, filters to open future slots,
  clears filters and displays no-results. Existing provider details and booking remain.

Already on main: #43 admin account/appointment totals and approval controls; #44
read-only user directory with name/email search and role filtering. This change
preserves those screens. No new API routes, schema changes or dependencies.

## Suggested demo (3-5 minutes)

1. Use two browser profiles/incognito sessions, one client and one provider. If needed,
   seed local demonstration accounts from backend with
   `flask --app app providers seed-demo`. Existing demo provider credentials are
   `alex.morgan@example.invalid` / `provider-demo-2026`; these are demo-only accounts.
2. Client home: show Your overview, then use Book an appointment. Book a future
   slot and show the upcoming count and next appointment change automatically.
3. Open Providers. Search `Alex` or `career`, enable Only providers with open times,
   try a nonmatching word, then Clear provider filters. Open a provider detail and return.
4. Reschedule/cancel a booking and show the overview refresh. Use View appointment
   history to reveal the retained record.
5. Provider home: show Scheduled today, Upcoming appointments and Open future slots.
   Press Refresh appointments after activity in the other browser. The demo seed uses
   future weekdays, so Scheduled today may legitimately be zero.
6. Use View today's appointments, All appointments, date and status filters, then
   Clear appointment filters. Cancel a booking as client, refresh as provider, and
   filter Cancelled. Outcome buttons remain restricted to appointments already started.
7. Optional admin recap: show existing totals and search/filter users. Approve a
   pending application to show account totals and directory refresh together.

## Verification

- `cd frontend && npm test` (Node 22.6+): 11 dashboard/search/date logic tests passed.
- `cd frontend && npm run build`: TypeScript and Vite build passed. In a restricted
  environment, `npm run build -- --configLoader native` was used.
- `cd backend && python -m unittest discover -s tests -q`: 73 tests passed.
- Isolated Chrome browser checks: client shortcuts, overview update after reschedule,
  cancellation and refresh, provider search/no-results/reset, date/status controls,
  Completed outcome, and existing admin approval/user search passed. Desktop/mobile
  overflow and page-error checks passed. Full keyboard-only and hosted smoke tests
  have not been claimed as passed.

Dates and today's counts use the browser's local timezone. Dashboard counts are
derived from existing role-restricted API responses; client filters do not grant
access to other accounts. Separate browser sessions need refresh to see external changes.
