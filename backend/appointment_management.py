"""Provider appointment management and client status history."""
from contextlib import closing
import sqlite3

from flask import Blueprint, g, jsonify, request

from availability import provider_only
from booking import client_only, future_slot
from database import connect

appointment_management = Blueprint('appointment_management', __name__)


@appointment_management.after_request
def no_cache(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


@appointment_management.get('/api/provider/appointments')
@provider_only
def provider_appointments():
    with closing(connect()) as db:
        rows = db.execute(
            'SELECT b.id, b.status, a.starts_at, a.ends_at, u.name AS client_name, '
            'u.email AS client_email FROM appointments b '
            'JOIN availability a ON a.id=b.availability_id '
            'JOIN users u ON u.id=b.client_id WHERE a.provider_id=? '
            'ORDER BY julianday(a.starts_at), b.id', (g.provider['id'],)
        ).fetchall()
    return jsonify(appointments=[dict(row) for row in rows])


@appointment_management.patch('/api/provider/appointments/<int:appointment_id>/status')
@provider_only
def update_status(appointment_id):
    if not request.is_json or request.headers.get('X-Requested-With') != 'AppointmentDesk':
        return jsonify(error='Invalid request.'), 400
    data = request.get_json(silent=True)
    status = data.get('status') if isinstance(data, dict) else None
    if status not in ('completed', 'no-show'):
        return jsonify(error='Choose Completed or No-show.'), 400
    with closing(connect()) as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute(
                'SELECT b.status, a.starts_at FROM appointments b '
                'JOIN availability a ON a.id=b.availability_id '
                'WHERE b.id=? AND a.provider_id=?', (appointment_id, g.provider['id'])
            ).fetchone()
            if row is None:
                return jsonify(error='This appointment was not found.'), 404
            if row['status'] != 'scheduled':
                return jsonify(error='Only scheduled appointments can change status.'), 409
            if future_slot(row['starts_at']):
                return jsonify(error='Wait until the appointment starts before recording its outcome.'), 409
            db.execute('UPDATE appointments SET status=? WHERE id=?', (status, appointment_id))
            db.commit()
        except sqlite3.OperationalError as error:
            db.rollback()
            if 'locked' in str(error).lower():
                return jsonify(error='Saving is busy. Please try again.'), 503
            raise
    return jsonify(appointment={'id': appointment_id, 'status': status})


@appointment_management.get('/api/appointments/history')
@client_only
def client_history():
    with closing(connect()) as db:
        rows = db.execute(
            'SELECT b.id, b.status, a.starts_at, a.ends_at, u.name AS provider_name '
            'FROM appointments b JOIN availability a ON a.id=b.availability_id '
            'JOIN users u ON u.id=a.provider_id WHERE b.client_id=? '
            'ORDER BY julianday(a.starts_at) DESC, b.id DESC', (g.client['id'],)
        ).fetchall()
    return jsonify(appointments=[dict(row) for row in rows])
