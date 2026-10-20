from contextlib import closing
from datetime import datetime, timedelta, timezone
import sqlite3
import unittest
import test_booking


class AppointmentModificationTest(unittest.TestCase):
    """#12: clients cancel or reschedule their own upcoming appointments."""
    setUp = test_booking.BookingTest.setUp
    tearDown = test_booking.BookingTest.tearDown
    identify = test_booking.BookingTest.identify

    def add_slot(self, slot_id, provider_id=3, days=2):
        start = datetime.now(timezone.utc) + timedelta(days=days)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute('INSERT INTO availability VALUES(?,?,?,?)', (slot_id, provider_id, start.isoformat(), (start + timedelta(minutes=30)).isoformat()))

    def book(self, slot_id=1):
        return self.client.post('/api/appointments', json={'availability_id': slot_id}, headers=self.headers).json['appointment']['id']

    def cancel(self, appointment_id, client=None):
        return (client or self.client).post(f'/api/appointments/{appointment_id}/cancel', json={}, headers=self.headers)

    def reschedule(self, appointment_id, slot_id):
        return self.client.post(f'/api/appointments/{appointment_id}/reschedule', json={'availability_id': slot_id}, headers=self.headers)

    def status(self, appointment_id):
        with closing(sqlite3.connect(self.database)) as db:
            return db.execute('SELECT status, availability_id FROM appointments WHERE id=?', (appointment_id,)).fetchone()

    def test_cancel_keeps_record_and_frees_slot(self):
        appointment = self.book()
        self.assertEqual(self.cancel(appointment).status_code, 200)
        self.assertEqual(self.status(appointment), ('cancelled', 1))
        self.assertEqual(self.client.get('/api/appointments').json['appointments'], [])
        self.assertIn(1, [slot['id'] for slot in self.client.get('/api/booking/options').json['slots']])
        self.identify(self.client, 2)
        self.assertEqual(self.client.post('/api/appointments', json={'availability_id': 1}, headers=self.headers).status_code, 201)

    def test_cancel_only_upcoming_scheduled_appointments(self):
        appointment = self.book()
        self.cancel(appointment)
        self.assertEqual(self.cancel(appointment).status_code, 409)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO appointments(id,client_id,availability_id) VALUES(50,1,2)")
            db.execute("INSERT INTO appointments(id,client_id,availability_id,status) VALUES(51,1,1,'completed')")
        self.assertEqual(self.cancel(50).status_code, 409)
        self.assertEqual(self.cancel(51).status_code, 409)
        self.assertEqual(self.cancel(999).status_code, 404)

    def test_reschedule_moves_same_appointment_and_frees_old_slot(self):
        self.add_slot(3)
        appointment = self.book()
        result = self.reschedule(appointment, 3)
        self.assertEqual(result.status_code, 200)
        self.assertEqual((result.json['appointment']['id'], result.json['appointment']['status']), (appointment, 'scheduled'))
        self.assertEqual(self.status(appointment), ('scheduled', 3))
        open_slots = [slot['id'] for slot in self.client.get('/api/booking/options').json['slots']]
        self.assertIn(1, open_slots)
        self.assertNotIn(3, open_slots)
        self.assertEqual([row['id'] for row in self.client.get('/api/appointments').json['appointments']], [appointment])

    def test_reschedule_rejects_taken_past_same_and_other_provider_slots(self):
        self.add_slot(3)
        self.add_slot(4)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO users VALUES(5,'other','5@example.com','unused','provider')")
            db.execute('INSERT INTO provider_profiles(user_id) VALUES(5)')
            db.execute("INSERT INTO appointments(client_id,availability_id) VALUES(2,4)")
        self.add_slot(6, provider_id=5)
        appointment = self.book()
        self.assertEqual(self.reschedule(appointment, 4).status_code, 409)
        self.assertEqual(self.reschedule(appointment, 2).status_code, 409)
        self.assertEqual(self.reschedule(appointment, 1).status_code, 400)
        self.assertEqual(self.reschedule(appointment, 6).status_code, 400)
        self.assertEqual(self.reschedule(appointment, 999).status_code, 404)
        for value in (True, '3', 0, None):
            self.assertEqual(self.reschedule(appointment, value).status_code, 400)
        self.assertEqual(self.status(appointment), ('scheduled', 1))

    def test_reschedule_only_upcoming_scheduled_appointments(self):
        self.add_slot(3)
        appointment = self.book()
        self.cancel(appointment)
        self.assertEqual(self.reschedule(appointment, 3).status_code, 409)

    def test_clients_cannot_change_other_clients_appointments(self):
        self.add_slot(3)
        appointment = self.book()
        self.identify(self.client, 2)
        self.assertEqual(self.cancel(appointment).status_code, 404)
        self.assertEqual(self.reschedule(appointment, 3).status_code, 404)
        self.assertEqual(self.status(appointment), ('scheduled', 1))

    def test_role_and_header_required(self):
        appointment = self.book()
        self.assertEqual(self.client.post(f'/api/appointments/{appointment}/cancel', json={}).status_code, 400)
        for user, expected in ((3, 403), (4, 403), (999, 401)):
            self.identify(self.client, user)
            self.assertEqual(self.cancel(appointment).status_code, expected)
            self.assertEqual(self.reschedule(appointment, 1).status_code, expected)


if __name__ == '__main__':
    unittest.main()
