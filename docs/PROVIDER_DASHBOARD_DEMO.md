# Provider dashboard (#42)

Provider home shows scheduled appointments today, upcoming scheduled count and open future slots. Existing appointments can be filtered by date/status, with All appointments, View today and Clear filters controls. Existing outcomes and availability management remain; changes refresh the overview.

Demo: sign in as a provider, show the three counts, select View today's appointments, then All appointments and a status/date. Clear filters to restore the full list. Add/remove an unused future slot to show the open count update. Refresh after a client books/cancels in another browser.

Browser dates use local time; outcomes are available only after an appointment starts. Run `cd frontend && npm test` (Node 22.6+).
