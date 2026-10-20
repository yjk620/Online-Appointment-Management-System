from contextlib import closing
from datetime import datetime, timedelta, timezone
import sqlite3
import unittest

import test_booking


class AppointmentManagementTest(unittest.TestCase):
    identify = test_booking.BookingTest.identify
    tearDown = test_booking.BookingTest.tearDown
    def setUp(self):
        test_booking.BookingTest.setUp(self)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO users VALUES(5,'Other provider','5@example.com','unused','provider')")
            start = datetime.now(timezone.utc) - timedelta(days=1)
            db.execute('INSERT INTO availability VALUES(3,3,?,?)',
                       (start.isoformat(), (start+timedelta(minutes=30)).isoformat()))
            db.execute("INSERT INTO appointments VALUES(1,1,3,'scheduled')")
            db.execute("INSERT INTO appointments VALUES(2,2,1,'cancelled')")
        self.identify(self.client, 3)

    def update(self, status='completed', appointment=1, headers=None):
        return self.client.patch(f'/api/provider/appointments/{appointment}/status',
                                 json={'status': status}, headers=self.headers if headers is None else headers)

    def test_provider_list_and_client_history_are_isolated(self):
        rows = self.client.get('/api/provider/appointments').json['appointments']
        self.assertEqual([r['id'] for r in rows], [1, 2])
        self.assertEqual(rows[0]['client_email'], '1@example.com')
        self.identify(self.client, 5)
        self.assertEqual(self.client.get('/api/provider/appointments').json['appointments'], [])
        self.assertEqual(self.update().status_code, 404)
        self.identify(self.client, 1)
        self.assertEqual([r['id'] for r in self.client.get('/api/appointments/history').json['appointments']], [1])

    def test_outcomes_persist_and_are_visible_to_client(self):
        self.assertEqual(self.update().status_code, 200)
        self.assertEqual(self.update('no-show').status_code, 409)
        self.identify(self.client, 1)
        response = self.client.get('/api/appointments/history')
        self.assertEqual(response.json['appointments'][0]['status'], 'completed')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_no_show_and_cancelled_history(self):
        self.assertEqual(self.update('no-show').status_code, 200)
        self.assertEqual(self.update(appointment=2).status_code, 409)
        self.identify(self.client, 2)
        self.assertEqual(self.client.get('/api/appointments/history').json['appointments'][0]['status'], 'cancelled')

    def test_validation_and_future_outcomes(self):
        for value in ('scheduled', 'cancelled', '', None, {}, []):
            self.assertEqual(self.update(value).status_code, 400)
        self.assertEqual(self.update(headers={}).status_code, 400)
        self.assertEqual(self.update(appointment=999).status_code, 404)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO appointments VALUES(3,1,1,'scheduled')")
        self.assertEqual(self.update(appointment=3).status_code, 409)

    def test_role_checks(self):
        for user, expected in ((1, 403), (4, 403), (999, 401)):
            self.identify(self.client, user)
            self.assertEqual(self.client.get('/api/provider/appointments').status_code, expected)
            self.assertEqual(self.update().status_code, expected)
        for user in (3, 4):
            self.identify(self.client, user)
            self.assertEqual(self.client.get('/api/appointments/history').status_code, 403)
