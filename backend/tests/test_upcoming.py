from contextlib import closing
import sqlite3
import unittest
import test_booking


class UpcomingTest(unittest.TestCase):
    setUp = test_booking.BookingTest.setUp
    tearDown = test_booking.BookingTest.tearDown
    identify = test_booking.BookingTest.identify

    def test_empty_list(self):
        response = self.client.get('/api/appointments')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {'appointments': []})
        self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_only_own_future_scheduled_appointments(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO appointments(client_id,availability_id) VALUES(2,1)")
            db.execute("INSERT INTO appointments(client_id,availability_id) VALUES(1,2)")
        self.assertEqual(self.client.get('/api/appointments?client_id=2').json['appointments'], [])
        self.identify(self.client, 2)
        rows = self.client.get('/api/appointments').json['appointments']
        self.assertEqual(len(rows), 1)
        self.assertEqual(set(rows[0]), {'id', 'provider_name', 'starts_at', 'ends_at', 'status'})
        self.assertEqual(rows[0]['provider_name'], 'provider')
        for status in ('cancelled', 'completed', 'no-show'):
            with closing(sqlite3.connect(self.database)) as db, db:
                db.execute('UPDATE appointments SET status=?', (status,))
            self.assertEqual(self.client.get('/api/appointments').json['appointments'], [])

    def test_new_booking_appears(self):
        self.client.post('/api/appointments', json={'availability_id': 1}, headers=self.headers)
        rows = self.client.get('/api/appointments').json['appointments']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['status'], 'scheduled')

    def test_authentication_and_role_required(self):
        self.assertEqual(self.app.test_client().get('/api/appointments').status_code, 401)
        for user, expected in ((3, 403), (4, 403), (999, 401)):
            self.identify(self.client, user)
            self.assertEqual(self.client.get('/api/appointments').status_code, expected)

    def test_chronological_order(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            for id, start, end in ((10, '2099-02-02T10:00:00+00:00', '2099-02-02T10:30:00+00:00'), (11, '2099-02-01T10:00:00+00:00', '2099-02-01T10:30:00+00:00')):
                db.execute('INSERT INTO availability VALUES(?,?,?,?)', (id, 3, start, end))
                db.execute('INSERT INTO appointments(id,client_id,availability_id) VALUES(?,1,?)', (id, id))
        self.assertEqual([row['id'] for row in self.client.get('/api/appointments').json['appointments']], [11, 10])
