from contextlib import closing
from datetime import datetime, timedelta, timezone
import sqlite3
import unittest

import test_booking


class ProviderAppointmentManagementTest(unittest.TestCase):
    """#13: providers view and update only appointments for their own slots."""
    setUp = test_booking.BookingTest.setUp
    tearDown = test_booking.BookingTest.tearDown
    identify = test_booking.BookingTest.identify

    def add_appointment(self, appointment_id=10, client_id=1, slot_id=2, status='scheduled'):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute(
                'INSERT INTO appointments(id,client_id,availability_id,status) VALUES(?,?,?,?)',
                (appointment_id, client_id, slot_id, status),
            )

    def update(self, appointment_id, status, client=None):
        return (client or self.client).post(
            f'/api/provider/appointments/{appointment_id}/status',
            json={'status': status},
            headers=self.headers,
        )

    def test_provider_sees_own_appointments_in_date_order_with_details(self):
        self.add_appointment(10, 1, 2)
        self.add_appointment(11, 2, 1, 'cancelled')
        self.identify(self.client, 3)
        rows = self.client.get('/api/provider/appointments').json['appointments']
        self.assertEqual([row['id'] for row in rows], [10, 11])
        self.assertEqual(
            set(rows[0]),
            {'id', 'status', 'client_id', 'client_name', 'client_email', 'starts_at', 'ends_at', 'can_update_status'},
        )
        self.assertEqual((rows[0]['client_name'], rows[0]['client_email']), ('client', '1@example.com'))
        self.assertTrue(rows[0]['can_update_status'])
        self.assertFalse(rows[1]['can_update_status'])

    def test_provider_marks_started_appointment_completed_or_no_show(self):
        for appointment_id, status in ((10, 'completed'), (11, 'no-show')):
            self.add_appointment(appointment_id, appointment_id - 9, 2)
            self.identify(self.client, 3)
            result = self.update(appointment_id, status)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json['appointment'], {'id': appointment_id, 'status': status})
            with closing(sqlite3.connect(self.database)) as db:
                self.assertEqual(db.execute('SELECT status FROM appointments WHERE id=?', (appointment_id,)).fetchone()[0], status)
            with closing(sqlite3.connect(self.database)) as db, db:
                db.execute('DELETE FROM appointments WHERE id=?', (appointment_id,))

    def test_cancelled_appointments_remain_visible_and_cannot_change_status(self):
        self.add_appointment(10, 1, 2, 'cancelled')
        self.identify(self.client, 3)
        rows = self.client.get('/api/provider/appointments').json['appointments']
        self.assertEqual([(row['id'], row['status']) for row in rows], [(10, 'cancelled')])
        self.assertEqual(self.update(10, 'completed').status_code, 409)

    def test_future_appointment_cannot_be_completed_early(self):
        self.add_appointment(10, 1, 1)
        self.identify(self.client, 3)
        self.assertEqual(self.update(10, 'completed').status_code, 409)

    def test_provider_cannot_view_or_update_another_providers_appointments(self):
        start = datetime.now(timezone.utc) - timedelta(hours=1)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO users VALUES(5,'other','5@example.com','unused','provider')")
            db.execute('INSERT INTO provider_profiles(user_id) VALUES(5)')
            db.execute('INSERT INTO availability VALUES(3,5,?,?)', (start.isoformat(), (start + timedelta(minutes=30)).isoformat()))
            db.execute("INSERT INTO appointments VALUES(10,1,3,'scheduled')")
        self.identify(self.client, 3)
        self.assertEqual(self.client.get('/api/provider/appointments').json['appointments'], [])
        self.assertEqual(self.update(10, 'completed').status_code, 404)

    def test_status_validation_role_and_header_are_required(self):
        self.add_appointment(10)
        self.identify(self.client, 3)
        for status in ('scheduled', 'cancelled', 'done', '', None, True):
            self.assertEqual(self.update(10, status).status_code, 400)
        self.assertEqual(
            self.client.post('/api/provider/appointments/10/status', json={'status': 'completed'}).status_code,
            400,
        )
        for user, expected in ((1, 403), (4, 403), (999, 401)):
            self.identify(self.client, user)
            self.assertEqual(self.client.get('/api/provider/appointments').status_code, expected)
            self.assertEqual(self.update(10, 'completed').status_code, expected)


if __name__ == '__main__':
    unittest.main()
