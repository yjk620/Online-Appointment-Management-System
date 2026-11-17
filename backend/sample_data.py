"""Sample data for local testing (#70): every edge case on the client, provider and admin pages.

  flask --app app sample seed     # replace old sample rows with fresh ones (times are relative to now)
  flask --app app sample remove   # delete every sample account and its rows

Every sample account uses @edge.example.invalid. Clients and providers sign in with password123;
the sample admin gets a random password so no one can sign in as it.
"""
from contextlib import closing
from datetime import datetime, timedelta, timezone
import secrets
import time

import click
from flask import Blueprint
from werkzeug.security import generate_password_hash

from database import connect

sample = Blueprint("sample", __name__)
DOMAIN = "@edge.example.invalid"
PASSWORD = "password123"


def local(day_offset, hour, minute=0):
    """UTC instant for a local wall-clock time; mktime applies the right DST offset for that date."""
    d = datetime.now().date() + timedelta(days=day_offset)
    return datetime.fromtimestamp(time.mktime((d.year, d.month, d.day, hour, minute, 0, 0, 0, -1)), timezone.utc)


def stamp(value):
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def remove_sample(db):
    ids = [row[0] for row in db.execute("SELECT id FROM users WHERE email LIKE ?", ("%" + DOMAIN,))]
    if ids:
        marks = ",".join("?" * len(ids))
        db.execute(f"DELETE FROM appointments WHERE client_id IN ({marks}) OR availability_id IN "
                   f"(SELECT id FROM availability WHERE provider_id IN ({marks}))", ids + ids)
        db.execute(f"DELETE FROM availability WHERE provider_id IN ({marks})", ids)
        db.execute(f"DELETE FROM provider_profiles WHERE user_id IN ({marks})", ids)
        db.execute(f"DELETE FROM pending_providers WHERE user_id IN ({marks})", ids)
        db.execute(f"DELETE FROM users WHERE id IN ({marks})", ids)
    return len(ids)


def seed_sample(db):
    password = generate_password_hash(PASSWORD)

    def user(name, email, role, hash_=password):
        return db.execute("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)", (name, email + DOMAIN, hash_, role)).lastrowid

    def provider(name, email, description):
        user_id = user(name, email, "provider")
        db.execute("INSERT INTO provider_profiles(user_id,description) VALUES(?,?)", (user_id, description))
        return user_id

    def slot(provider_id, start, *bookings):
        """bookings: (client_id, status), oldest first, so a rebooked slot's current booking is last."""
        slot_id = db.execute("INSERT INTO availability(provider_id,starts_at,ends_at) VALUES(?,?,?)",
                             (provider_id, start.isoformat(), (start + timedelta(minutes=30)).isoformat())).lastrowid
        for client_id, status in bookings:
            db.execute("INSERT INTO appointments(client_id,availability_id,status) VALUES(?,?,?)", (client_id, slot_id, status))

    # --- Provider page: Morgan Edge, with clients whose names stress the layout ---
    morgan = provider("Morgan Edge", "provider", "Sample provider covering every schedule edge case")
    casey, avery, zoe, maxi, dana = (user(name, email, "client") for name, email in (
        ("Casey Brooks", "casey"),
        ("Avery O'Neil-Fitzgerald", "avery"),
        ("Zoë Ångström", "zoe"),
        ("Maximilian Alexander Featherstonehaugh-Whittington", "maximilian.alexander.featherstonehaugh-whittington"),
        ("Dana Kim", "dana"),
    ))
    now = datetime.now()
    # The current half-hour block, so Now and "just ended" line up with :00/:30 slots.
    block = local(0, now.hour, 0 if now.minute < 30 else 30)

    # Needs an outcome: ended minutes ago, yesterday, over a week overdue.
    slot(morgan, block - timedelta(minutes=30), (casey, "scheduled"))
    slot(morgan, local(-1, 14), (zoe, "scheduled"))
    slot(morgan, local(-8, 10), (maxi, "scheduled"))
    # Now, and one starting right after it (two Next cards).
    slot(morgan, block, (avery, "scheduled"))
    slot(morgan, block + timedelta(minutes=30), (dana, "scheduled"))
    # Later: back-to-back tomorrow, rebooked after a cancellation, ends at midnight, next year, DST change.
    slot(morgan, local(1, 9), (casey, "scheduled"))
    slot(morgan, local(1, 9, 30), (zoe, "scheduled"))
    slot(morgan, local(3, 11), (avery, "cancelled"), (dana, "scheduled"))
    slot(morgan, local(4, 23, 30), (maxi, "scheduled"))
    slot(morgan, local(14, 15), (casey, "scheduled"))
    next_year = datetime.now().year + 1
    slot(morgan, datetime(next_year, 1, 6, 15, tzinfo=timezone.utc), (zoe, "scheduled"))
    # North American clocks spring forward on the second Sunday of March; 6:30 UTC is 1:30 AM Eastern, ending after the jump.
    march = datetime(next_year, 3, 8, 6, 30, tzinfo=timezone.utc)
    slot(morgan, march + timedelta(days=(6 - march.weekday()) % 7), (dana, "scheduled"))
    # History in every status, including last month and last year.
    slot(morgan, local(-2, 13), (casey, "completed"))
    slot(morgan, local(-3, 15), (avery, "no-show"))
    slot(morgan, local(-5, 10), (zoe, "cancelled"))
    slot(morgan, local(-30, 11), (maxi, "completed"))
    slot(morgan, datetime(datetime.now().year - 1, 11, 10, 15, tzinfo=timezone.utc), (dana, "completed"))
    slot(morgan, local(-6, 9), (casey, "no-show"))
    # Open slots that only ever had cancelled bookings (editable since #64).
    slot(morgan, local(2, 13), (casey, "cancelled"))
    slot(morgan, local(5, 10), (avery, "cancelled"), (zoe, "cancelled"))
    # Plain open slots: one in the past (must not show), one tomorrow, a full morning, one in three weeks.
    slot(morgan, local(-1, 16))
    slot(morgan, local(1, 16))
    for minutes in (0, 30, 60, 90):
        slot(morgan, local(6, 9 + minutes // 60, minutes % 60))
    slot(morgan, local(21, 14))

    # --- Admin page ---
    # Applications from last year (the date shows the year), last week, and a minute ago.
    for name, email, applied in (
        ("Siobhán O'Brien", "siobhan", datetime(datetime.now().year - 1, 12, 30, 22, 15, tzinfo=timezone.utc)),
        ("Dr. Bartholomew Montgomery-Vanderbilt III", "bartholomew.montgomery-vanderbilt.the.third.applications", datetime.now(timezone.utc) - timedelta(days=7)),
        ("100% Care_Clinic", "percent_underscore", datetime.now(timezone.utc) - timedelta(minutes=1)),
    ):
        db.execute("INSERT INTO pending_providers(user_id,requested_at) VALUES(?,?)", (user(name, email, "provider"), stamp(applied)))
    # A second admin for the Admin tag. Random password: the seed must never create an admin anyone can sign in as.
    user("Rae Second-Admin", "admin2", "admin", generate_password_hash(secrets.token_urlsafe(32)))
    sam = provider("Sam Rivers", "sam.rivers", "Second sample provider")
    clients = [user(f"Sample Client {n:02}", f"client{n:02}", "client") for n in range(1, 9)]
    # 9 more no-shows, so the no-show filter alone needs Show more.
    for n in range(9):
        slot(sam, local(-(n * 3 + 4), 13), (clients[n % len(clients)], "no-show"))
    # Same morning as Morgan Edge, so the date filter shows two providers on one day.
    slot(sam, local(1, 9), (clients[0], "scheduled"))
    slot(sam, local(1, 10), (clients[1], "cancelled"))


@sample.cli.command("seed")
def seed_command():
    """Replace the sample accounts and appointments with fresh ones."""
    with closing(connect()) as db, db:
        removed = remove_sample(db)
        seed_sample(db)
    click.echo(f"Sample data ready (replaced {removed} old sample accounts). For local testing only.")
    click.echo(f"Sign in as provider{DOMAIN} or casey{DOMAIN} with {PASSWORD}.")


@sample.cli.command("remove")
def remove_command():
    """Delete every sample account and its rows."""
    with closing(connect()) as db, db:
        removed = remove_sample(db)
    click.echo(f"Removed {removed} sample accounts and their rows.")
