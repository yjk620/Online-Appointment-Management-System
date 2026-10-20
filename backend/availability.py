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
            "WHERE b.availability_id = a.id AND b.status != 'cancelled') AS booked "
            "FROM availability a WHERE a.provider_id = ? ORDER BY julianday(a.starts_at), a.id",
            (g.provider["id"],),
        ).fetchall()
    return jsonify(slots=[{**dict(row), "booked": bool(row["booked"])} for row in rows if future_slot(row["starts_at"])])


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
    return jsonify(slot={"id": cursor.lastrowid, **slot, "booked": False}), 201


@availability.route('/api/provider/availability/<int:slot_id>', methods=['PATCH', 'DELETE'])
@provider_only
def modify_slot(slot_id):
    if not request.is_json or request.headers.get('X-Requested-With') != 'AppointmentDesk':
        return jsonify(error='Invalid request.'), 400
    start = None
    if request.method == 'PATCH':
        data = request.get_json(silent=True)
        start = parse_start(data.get('starts_at')) if isinstance(data, dict) else None
        if start is None or start <= datetime.now(timezone.utc):
            return jsonify(error='Choose a valid future time with a time zone.'), 400
        end = start + SLOT_LENGTH
    with closing(connect()) as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM availability WHERE id=? AND provider_id=?',
                             (slot_id, g.provider['id'])).fetchone()
            if row is None:
                return jsonify(error='This time slot was not found.'), 404
            if not future_slot(row['starts_at']):
                return jsonify(error='Only future availability can be changed.'), 409
            # Preserve the time attached to every historical appointment, too.
            if db.execute('SELECT 1 FROM appointments WHERE availability_id=?', (slot_id,)).fetchone():
                return jsonify(error='This slot has appointment history and cannot be changed. Add a new slot instead.'), 409
            if request.method == 'DELETE':
                db.execute('DELETE FROM availability WHERE id=?', (slot_id,))
                db.commit()
                return jsonify(message='Availability removed.')
            if db.execute(
                'SELECT 1 FROM availability WHERE provider_id=? AND id!=? '
                'AND julianday(starts_at)<julianday(?) AND julianday(ends_at)>julianday(?)',
                (g.provider['id'], slot_id, end.isoformat(), start.isoformat())
            ).fetchone():
                return jsonify(error='This time overlaps one of your existing slots.'), 409
            db.execute('UPDATE availability SET starts_at=?,ends_at=? WHERE id=?',
                       (start.isoformat(), end.isoformat(), slot_id))
            db.commit()
        except sqlite3.OperationalError as error:
            db.rollback()
            if 'locked' in str(error).lower():
                return jsonify(error='Saving is busy. Please try again.'), 503
            raise
    return jsonify(slot={'id': slot_id, 'starts_at': start.isoformat(),
                         'ends_at': end.isoformat(), 'booked': False})
