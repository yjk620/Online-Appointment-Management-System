from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import sqlite3
import unittest
import test_booking


class AvailabilityEditingTest(unittest.TestCase):
    setUp = test_booking.BookingTest.setUp
    tearDown = test_booking.BookingTest.tearDown
    identify = test_booking.BookingTest.identify

    def change(self, method='patch', slot=1, value=None, headers=None):
        if value is None:
            value = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        return getattr(self.client, method)(f'/api/provider/availability/{slot}',
            json={'starts_at': value}, headers=self.headers if headers is None else headers)

    def test_edit_and_delete_reflect_in_client_options(self):
        self.identify(self.client, 3)
        response = self.change()
        self.assertEqual(response.status_code, 200)
        self.identify(self.client, 1)
        self.assertEqual(self.client.get('/api/booking/options').json['slots'][0]['starts_at'], response.json['slot']['starts_at'])
        self.identify(self.client, 3)
        self.assertEqual(self.change('delete').status_code, 200)
        self.identify(self.client, 1)
        self.assertEqual(self.client.get('/api/booking/options').json['slots'], [])

    def test_booked_and_historical_times_are_preserved(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute('INSERT INTO appointments(client_id,availability_id) VALUES(1,1)')
        self.identify(self.client, 3)
        for status in ('scheduled', 'cancelled', 'completed', 'no-show'):
            with closing(sqlite3.connect(self.database)) as db, db:
                db.execute('UPDATE appointments SET status=?', (status,))
            self.assertEqual(self.change().status_code, 409)
            self.assertEqual(self.change('delete').status_code, 409)

    def test_role_ownership_input_and_past_checks(self):
        for user, code in ((1, 403), (4, 403), (999, 401)):
            self.identify(self.client, user)
            for method in ('patch', 'delete'):
                self.assertEqual(self.change(method).status_code, code)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO users VALUES(5,'Other','5@example.com','unused','provider')")
        self.identify(self.client, 5)
        self.assertEqual(self.change().status_code, 404)
        self.assertEqual(self.change('delete').status_code, 404)
        self.identify(self.client, 3)
        for value in ('invalid', '2099-01-01T12:00:00', True, [], '2000-01-01T12:00:00Z'):
            self.assertEqual(self.change(value=value).status_code, 400)
        self.assertEqual(self.change(headers={}).status_code, 400)
        self.assertEqual(self.change('delete', headers={}).status_code, 400)
        self.assertEqual(self.change(slot=2).status_code, 409)
        self.assertEqual(self.change('delete', slot=2).status_code, 409)

    def test_overlap_rejected_but_same_time_allowed(self):
        self.identify(self.client, 3)
        with closing(sqlite3.connect(self.database)) as db, db:
            start = db.execute('SELECT starts_at FROM availability WHERE id=1').fetchone()[0]
            other = datetime.fromisoformat(start) + timedelta(hours=2)
            db.execute('INSERT INTO availability VALUES(3,3,?,?)', (other.isoformat(), (other+timedelta(minutes=30)).isoformat()))
        self.assertEqual(self.change(value=start).status_code, 200)
        self.assertEqual(self.change(value=other.isoformat()).status_code, 409)

    def test_booking_and_removal_cannot_lose_an_appointment(self):
        def action(role):
            client = self.app.test_client()
            self.identify(client, role)
            if role == 1:
                return client.post('/api/appointments', json={'availability_id': 1}, headers=self.headers).status_code
            return client.delete('/api/provider/availability/1', json={}, headers=self.headers).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            result = list(pool.map(action, (1, 3)))
        self.assertIn(result, ([201, 409], [404, 200]))
