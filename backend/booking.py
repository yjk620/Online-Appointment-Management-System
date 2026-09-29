"""Booking API, independent of provider browsing and availability editing screens."""
from contextlib import closing
from datetime import datetime, timezone, timedelta
from functools import wraps
import secrets
import sqlite3

import click
from flask import Blueprint, g, jsonify, request, session
from werkzeug.security import generate_password_hash
from database import connect

booking = Blueprint("booking", __name__)


def client_only(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        with closing(connect()) as db:
            g.client = db.execute("SELECT id, role FROM users WHERE id=?", (session.get("user_id"),)).fetchone()
        if g.client is None:
            return jsonify(error="Please sign in."), 401
        if g.client["role"] != "client":
            return jsonify(error="This feature is available to clients only."), 403
        return view(*args, **kwargs)
    return wrapped


def future_slot(value):
    try:
        start = datetime.fromisoformat(value.replace("Z", "+00:00"))
        # Existing naive database timestamps are interpreted as UTC.
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        return start > datetime.now(timezone.utc)
    except (ValueError, TypeError):
        return False


@booking.after_request
def prevent_caching(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@booking.get("/api/booking/options")
@client_only
def options():
    with closing(connect()) as db:
        providers = db.execute("SELECT u.id, u.name, p.description FROM users u JOIN provider_profiles p ON p.user_id=u.id WHERE u.role='provider' ORDER BY u.name,u.id").fetchall()
        slots = db.execute("SELECT a.* FROM availability a JOIN users u ON u.id=a.provider_id JOIN provider_profiles p ON p.user_id=u.id WHERE u.role='provider' AND NOT EXISTS (SELECT 1 FROM appointments b WHERE b.availability_id=a.id AND b.status!='cancelled') ORDER BY julianday(a.starts_at),a.id").fetchall()
    return jsonify(providers=[dict(p) for p in providers], slots=[dict(s) for s in slots if future_slot(s["starts_at"])])


@booking.get("/api/appointments")
@client_only
def upcoming_appointments():
    with closing(connect()) as db:
        rows = db.execute(
            "SELECT b.id, u.name AS provider_name, a.starts_at, a.ends_at, b.status "
            "FROM appointments b JOIN availability a ON a.id=b.availability_id "
            "JOIN users u ON u.id=a.provider_id "
            "WHERE b.client_id=? AND b.status='scheduled' "
            "ORDER BY julianday(a.starts_at), b.id",
            (g.client["id"],),
        ).fetchall()
    return jsonify(appointments=[dict(row) for row in rows if future_slot(row["starts_at"])])


@booking.post("/api/appointments")
@client_only
def book():
    if not request.is_json or request.headers.get("X-Requested-With") != "AppointmentDesk":
        return jsonify(error="Invalid request."), 400
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or type(data.get("availability_id")) is not int or data["availability_id"] <= 0:
        return jsonify(error="Select an available time slot."), 400
    with closing(connect()) as db:
        try:
            # Serialize validation and insertion so two requests cannot take one slot.
            db.execute("BEGIN IMMEDIATE")
            slot = db.execute("SELECT a.*, u.name AS provider_name FROM availability a JOIN users u ON u.id=a.provider_id JOIN provider_profiles p ON p.user_id=u.id WHERE a.id=? AND u.role='provider'", (data["availability_id"],)).fetchone()
            if slot is None:
                return jsonify(error="This time slot no longer exists."), 404
            if not future_slot(slot["starts_at"]):
                return jsonify(error="This time slot is no longer available."), 409
            cursor = db.execute("INSERT INTO appointments(client_id,availability_id) VALUES(?,?)", (g.client["id"], slot["id"]))
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            return jsonify(error="This time slot was just booked. Please choose another."), 409
        except sqlite3.OperationalError as error:
            db.rollback()
            if "locked" in str(error).lower():
                return jsonify(error="Booking is busy. Please try again."), 503
            raise
    return jsonify(appointment={"id": cursor.lastrowid, "provider_name": slot["provider_name"], "starts_at": slot["starts_at"], "ends_at": slot["ends_at"], "status": "scheduled"}), 201


@booking.cli.command("seed-demo")
def seed_demo():
    """Add two demo providers and future UTC slots for local booking tests."""
    day = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=14, minute=0, second=0, microsecond=0)
    with closing(connect()) as db, db:
        for index, name in enumerate(("Demo Advisor A", "Demo Advisor B")):
            email = f"booking-demo-{index}@example.invalid"
            db.execute("INSERT OR IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,'provider')", (name, email, generate_password_hash(secrets.token_urlsafe(32))))
            user = db.execute("SELECT id,role FROM users WHERE email=?", (email,)).fetchone()
            if user["role"] != "provider":
                raise click.ClickException("Demo email belongs to a non-provider; no accounts were changed.")
            db.execute("INSERT OR IGNORE INTO provider_profiles(user_id,description) VALUES(?,?)", (user["id"], "Demo advisor for local booking tests"))
            for offset in (index, index + 2):
                start = day + timedelta(hours=offset)
                db.execute("INSERT OR IGNORE INTO availability(provider_id,starts_at,ends_at) VALUES(?,?,?)", (user["id"], start.isoformat(), (start + timedelta(minutes=30)).isoformat()))
    click.echo("Demo providers and tomorrow's slots are ready. Register or log in as a client to book.")
