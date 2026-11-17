# Provider dashboard (#42, simplified in #51)

Provider home greets the provider ("Hi, Alex."), names the time zone and shows one summary line: "N upcoming · N open slots", led by "N needs an outcome" when any are waiting.

Each appointment appears in one place. Left column: Needs an outcome (amber; scheduled appointments whose end time has passed, with Mark completed / Mark no-show), the next appointment as a card (it keeps its place with a green Now tag and the outcome buttons while in progress; a second card appears when the following appointment starts within an hour of it ending), Later appointments (open for one or two, collapsed at three or more), and History (collapsed; completed, no-show and cancelled, newest first) with date and status filters and a Clear filters link while a filter is active.

Status tags pair a colour with a word: Now (green), No-show (red), Completed and Cancelled (grey; cancelled times are struck through). Upcoming scheduled cards have no tag; their relative time ("in 3 hours", "tomorrow") is highlighted for today and tomorrow. Client Appointment history uses the same tags. Confirming an outcome names it ("Mark Jamie Lee as a no-show? This can't be changed." with a Mark no-show button). Right column: Your availability. Phones stack the same sections in one column.

Data reloads after every change and when the browser tab regains focus; Retry appears only when loading fails.

Demo: sign in as a provider, read the summary line, record an outcome on an appointment that has ended and watch it move to History, then filter History by a date and a status and clear. Add and remove an unused future slot and watch the open count change. Book or cancel as a client in another tab, then return to the provider tab to see it update.

Browser dates use local time; outcomes are available only after an appointment starts. Run `cd frontend && npm test` (Node 22.6+).
