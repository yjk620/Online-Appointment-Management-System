"""Provider availability (#10): providers create and list their own 30-minute slots.

Slots are stored as UTC ISO 8601 with an explicit offset, like the demo seeds.
Clients see new slots through GET /api/booking/options without further changes.
"""
from contextlib import closing
from datetime import datetime, timedelta, timezone
from functools import wraps
import sqlite3

from flask import Blueprint, g, jsonify, request, session

from booking import future_slot
from database import connect

availability = Blueprint("availability", __name__)

SLOT_LENGTH = timedelta(minutes=30)


def provider_only(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        with closing(connect()) as db:
            g.provider = db.execute("SELECT id, role FROM users WHERE id=?", (session.get("user_id"),)).fetchone()
        if g.provider is None:
            return jsonify(error="Please sign in."), 401
        if g.provider["role"] != "provider":
            return jsonify(error="This feature is available to providers only."), 403
        return view(*args, **kwargs)
    return wrapped


def parse_start(value):
    """Return the start as an aware UTC datetime, or None unless it is ISO 8601 with an offset."""
    if not isinstance(value, str):
        return None
    try:
        start = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if start.tzinfo is None:
        return None
    return start.astimezone(timezone.utc)


@availability.after_request
def prevent_caching(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@availability.get("/api/provider/availability")
@provider_only
def own_slots():
    with closing(connect()) as db:
        rows = db.execute(
            "SELECT a.id, a.starts_at, a.ends_at, EXISTS (SELECT 1 FROM appointments b "
            "WHERE b.availability_id = a.id AND b.status != 'cancelled') AS booked, "
            "EXISTS (SELECT 1 FROM appointments h WHERE h.availability_id = a.id) AS locked "
            "FROM availability a WHERE a.provider_id = ? ORDER BY julianday(a.starts_at), a.id",
            (g.provider["id"],),
        ).fetchall()
    return jsonify(slots=[
        {**dict(row), "booked": bool(row["booked"]), "locked": bool(row["locked"])}
        for row in rows if future_slot(row["starts_at"])
    ])


@availability.post("/api/provider/availability")
@provider_only
def create_slot():
    if not request.is_json or request.headers.get("X-Requested-With") != "AppointmentDesk":
        return jsonify(error="Invalid request."), 400
    data = request.get_json(silent=True)
    start = parse_start(data.get("starts_at")) if isinstance(data, dict) else None
    if start is None:
        return jsonify(error="Choose a date and start time."), 400
    if start <= datetime.now(timezone.utc):
        return jsonify(error="Choose a start time in the future."), 400
    end = start + SLOT_LENGTH
    slot = {"starts_at": start.isoformat(), "ends_at": end.isoformat()}
    with closing(connect()) as db:
        try:
            # Serialize the overlap check and insert so two requests cannot add overlapping slots.
            db.execute("BEGIN IMMEDIATE")
            overlap = db.execute(
                "SELECT 1 FROM availability WHERE provider_id = ? "
                "AND julianday(starts_at) < julianday(?) AND julianday(ends_at) > julianday(?)",
                (g.provider["id"], slot["ends_at"], slot["starts_at"]),
            ).fetchone()
            if overlap:
                db.rollback()
                return jsonify(error="This time overlaps one of your existing slots."), 409
            cursor = db.execute(
                "INSERT INTO availability (provider_id, starts_at, ends_at) VALUES (?, ?, ?)",
                (g.provider["id"], slot["starts_at"], slot["ends_at"]),
            )
            db.commit()
        except sqlite3.OperationalError as error:
            db.rollback()
            if "locked" in str(error).lower():
                return jsonify(error="Saving is busy. Please try again."), 503
            raise
    return jsonify(slot={"id": cursor.lastrowid, **slot, "booked": False, "locked": False}), 201


def trusted_json_request():
    return request.is_json and request.headers.get("X-Requested-With") == "AppointmentDesk"


def editable_slot(db, slot_id):
    return db.execute(
        "SELECT a.*, EXISTS (SELECT 1 FROM appointments b WHERE b.availability_id=a.id) AS locked "
        "FROM availability a WHERE a.id=? AND a.provider_id=?",
        (slot_id, g.provider["id"]),
    ).fetchone()


@availability.patch("/api/provider/availability/<int:slot_id>")
@provider_only
def update_slot(slot_id):
    if not trusted_json_request():
        return jsonify(error="Invalid request."), 400
    data = request.get_json(silent=True)
    start = parse_start(data.get("starts_at")) if isinstance(data, dict) else None
    if start is None:
        return jsonify(error="Choose a date and start time."), 400
    if start <= datetime.now(timezone.utc):
        return jsonify(error="Choose a start time in the future."), 400
    end = start + SLOT_LENGTH
    starts_at, ends_at = start.isoformat(), end.isoformat()
    with closing(connect()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            slot = editable_slot(db, slot_id)
            if slot is None:
                db.rollback()
                return jsonify(error="This availability was not found."), 404
            if slot["locked"]:
                db.rollback()
                return jsonify(error="Availability with appointment history cannot be changed."), 409
            overlap = db.execute(
                "SELECT 1 FROM availability WHERE provider_id=? AND id!=? "
                "AND julianday(starts_at) < julianday(?) AND julianday(ends_at) > julianday(?)",
                (g.provider["id"], slot_id, ends_at, starts_at),
            ).fetchone()
            if overlap:
                db.rollback()
                return jsonify(error="This time overlaps one of your existing slots."), 409
            db.execute(
                "UPDATE availability SET starts_at=?, ends_at=? WHERE id=?",
                (starts_at, ends_at, slot_id),
            )
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            return jsonify(error="This time overlaps one of your existing slots."), 409
        except sqlite3.OperationalError as error:
            db.rollback()
            if "locked" in str(error).lower():
                return jsonify(error="Saving is busy. Please try again."), 503
            raise
    return jsonify(slot={"id": slot_id, "starts_at": starts_at, "ends_at": ends_at, "booked": False, "locked": False})


@availability.delete("/api/provider/availability/<int:slot_id>")
@provider_only
def delete_slot(slot_id):
    if not trusted_json_request():
        return jsonify(error="Invalid request."), 400
    with closing(connect()) as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            slot = editable_slot(db, slot_id)
            if slot is None:
                db.rollback()
                return jsonify(error="This availability was not found."), 404
            if slot["locked"]:
                db.rollback()
                return jsonify(error="Availability with appointment history cannot be removed."), 409
            db.execute("DELETE FROM availability WHERE id=?", (slot_id,))
            db.commit()
        except sqlite3.OperationalError as error:
            db.rollback()
            if "locked" in str(error).lower():
                return jsonify(error="Saving is busy. Please try again."), 503
            raise
    return jsonify(message="Availability removed.")
