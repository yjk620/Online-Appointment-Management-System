# Provider search (#45)

As a client, the Book an appointment section starts with the provider list. Search a provider name or description (case-insensitive), enable Only providers with open times, try a nonmatching query, then Clear provider filters. Each provider shows its next opening; choosing one goes straight to the calendar. Only future unbooked times qualify.

Demo: search Alex or career, try a nonmatching term, clear, then choose a provider and use Change provider to return. Reuse the existing provider seed if needed. Run `cd frontend && npm test` (Node 22.6+).
