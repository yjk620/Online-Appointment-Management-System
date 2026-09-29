"""Demo advisors with working logins and distinct availability (#22).

The provider directory screen (#5) reads GET /api/booking/options, so this
module adds no HTTP routes.
"""
from contextlib import closing
from datetime import datetime, timedelta, timezone

import click
from flask import Blueprint
from werkzeug.security import generate_password_hash

from database import connect

providers = Blueprint("providers", __name__)

DEMO_PASSWORD = "advisor-demo-2026"

# (name, email, description, indexes into the next six weekdays, UTC start hours)
DEMO_PROVIDERS = (
    ("Alex Morgan", "alex.morgan@example.invalid",
     "Academic advising: course selection, prerequisites and degree planning.",
     (0, 2, 4), (13, 14)),
    ("Priya Shah", "priya.shah@example.invalid",
     "Career advising: co-op, internships and resume reviews.",
     (1, 3), (17, 18)),
    ("Sofia Rossi", "sofia.rossi@example.invalid",
     "Financial aid advising: bursaries, scholarships and budgeting.",
     (0, 1, 2, 3, 4), (20,)),
    ("Omar Haddad", "omar.haddad@example.invalid",
     "Student success advising: study skills and academic recovery plans.",
     (5,), (15, 16, 17)),
)


def upcoming_weekdays(count):
    """Return the next `count` weekdays at UTC midnight, starting tomorrow."""
    day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    days = []
    while len(days) < count:
        day += timedelta(days=1)
        if day.weekday() < 5:
            days.append(day)
    return days


@providers.cli.command("seed-demo")
def seed_demo():
    """Add four demo advisors with profiles, logins and distinct 30-minute slots."""
    weekdays = upcoming_weekdays(6)
    with closing(connect()) as db, db:
        for name, email, description, day_indexes, hours in DEMO_PROVIDERS:
            db.execute(
                "INSERT OR IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,'provider')",
                (name, email, generate_password_hash(DEMO_PASSWORD)),
            )
            user = db.execute("SELECT id, role FROM users WHERE email=?", (email,)).fetchone()
            if user["role"] != "provider":
                raise click.ClickException(f"{email} belongs to a non-provider account; no accounts were changed.")
            db.execute(
                "INSERT OR IGNORE INTO provider_profiles(user_id,description) VALUES(?,?)",
                (user["id"], description),
            )
            for index in day_indexes:
                for hour in hours:
                    start = weekdays[index] + timedelta(hours=hour)
                    db.execute(
                        "INSERT OR IGNORE INTO availability(provider_id,starts_at,ends_at) VALUES(?,?,?)",
                        (user["id"], start.isoformat(), (start + timedelta(minutes=30)).isoformat()),
                    )
    click.echo(f"Demo advisors ready. Sign in with password {DEMO_PASSWORD} as:")
    for _, email, *_ in DEMO_PROVIDERS:
        click.echo(f"  {email}")
