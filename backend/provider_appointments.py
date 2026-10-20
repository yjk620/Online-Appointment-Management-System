"""Provider appointment management (#13)."""
from contextlib import closing

from flask import Blueprint, g, jsonify, request

from availability import provider_only
from booking import future_slot
from database import connect

provider_appointments = Blueprint("provider_appointments", __name__)


def trusted_json_request():
    return request.is_json and request.headers.get("X-Requested-With") == "AppointmentDesk"


@provider_appointments.after_request
def prevent_caching(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@provider_appointments.get("/api/provider/appointments")
@provider_only
def own_appointments():
    with closing(connect()) as db:
        rows = db.execute(
            "SELECT b.id, b.status, b.client_id, u.name AS client_name, u.email AS client_email, "
            "a.starts_at, a.ends_at FROM appointments b "
            "JOIN availability a ON a.id=b.availability_id "
            "JOIN users u ON u.id=b.client_id "
            "WHERE a.provider_id=? ORDER BY julianday(a.starts_at), b.id",
            (g.provider["id"],),
        ).fetchall()
    appointments = []
    for row in rows:
        appointment = dict(row)
        appointment["can_update_status"] = row["status"] == "scheduled" and not future_slot(row["starts_at"])
        appointments.append(appointment)
    return jsonify(appointments=appointments)


@provider_appointments.post("/api/provider/appointments/<int:appointment_id>/status")
@provider_only
def update_status(appointment_id):
    if not trusted_json_request():
        return jsonify(error="Invalid request."), 400
    data = request.get_json(silent=True)
    status = data.get("status") if isinstance(data, dict) else None
    if status not in ("completed", "no-show"):
        return jsonify(error="Choose Completed or No-show."), 400
    with closing(connect()) as db, db:
        appointment = db.execute(
            "SELECT b.id, b.status, a.starts_at FROM appointments b "
            "JOIN availability a ON a.id=b.availability_id "
            "WHERE b.id=? AND a.provider_id=?",
            (appointment_id, g.provider["id"]),
        ).fetchone()
        if appointment is None:
            return jsonify(error="This appointment was not found."), 404
        if appointment["status"] != "scheduled":
            return jsonify(error="Only scheduled appointments can be updated."), 409
        if future_slot(appointment["starts_at"]):
            return jsonify(error="Status can be updated after the appointment starts."), 409
        db.execute("UPDATE appointments SET status=? WHERE id=?", (status, appointment_id))
    return jsonify(appointment={"id": appointment_id, "status": status})
