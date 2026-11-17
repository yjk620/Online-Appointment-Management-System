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
            value = (datetime.now(timezone.utc) + timedelta(days=3)).replace(minute=0, second=0, microsecond=0).isoformat()
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

    def test_booked_times_are_preserved(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute('INSERT INTO appointments(client_id,availability_id) VALUES(1,1)')
        self.identify(self.client, 3)
        for status in ('scheduled', 'completed', 'no-show'):
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
            db.execute('INSERT INTO availability(id,provider_id,starts_at,ends_at) VALUES(3,3,?,?)', (other.isoformat(), (other+timedelta(minutes=30)).isoformat()))
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


class CancelledHistoryTest(unittest.TestCase):
    """#64: open slots whose only bookings were cancelled can be removed and edited; the cancelled bookings keep their time."""
    setUp = test_booking.BookingTest.setUp
    tearDown = test_booking.BookingTest.tearDown
    identify = test_booking.BookingTest.identify
    change = AvailabilityEditingTest.change

    def cancelled_booking(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO appointments(id,client_id,availability_id,status) VALUES(9,1,1,'cancelled')")
            return db.execute('SELECT starts_at FROM availability WHERE id=1').fetchone()[0]

    def visible(self):
        self.identify(self.client, 3)
        provider = [slot['id'] for slot in self.client.get('/api/provider/availability').json['slots']]
        self.identify(self.client, 1)
        options = [slot['id'] for slot in self.client.get('/api/booking/options').json['slots']]
        return provider, options

    def history_time(self):
        self.identify(self.client, 1)
        return {row['id']: row['starts_at'] for row in self.client.get('/api/appointments/history').json['appointments']}[9]

    def test_remove_hides_the_slot_and_keeps_the_cancelled_booking(self):
        original = self.cancelled_booking()
        self.identify(self.client, 3)
        self.assertEqual(self.change('delete').status_code, 200)
        self.assertEqual(self.visible(), ([], []))
        self.assertEqual(self.history_time(), original)
        self.assertEqual(self.client.post('/api/appointments', json={'availability_id': 1}, headers=self.headers).status_code, 404)
        self.identify(self.client, 3)
        self.assertEqual(self.change('delete').status_code, 404)
        self.assertEqual(self.change().status_code, 404)

    def test_edit_moves_to_a_new_slot_and_keeps_the_cancelled_booking(self):
        original = self.cancelled_booking()
        self.identify(self.client, 3)
        response = self.change()
        self.assertEqual(response.status_code, 200)
        new_id = response.json['slot']['id']
        self.assertNotEqual(new_id, 1)
        self.assertEqual(self.visible(), ([new_id], [new_id]))
        self.assertEqual(self.history_time(), original)

    def test_adding_a_removed_time_again_brings_the_slot_back(self):
        original = self.cancelled_booking()
        self.identify(self.client, 3)
        self.change('delete')
        added = self.client.post('/api/provider/availability', json={'starts_at': original}, headers=self.headers)
        self.assertEqual((added.status_code, added.json['slot']['id']), (201, 1))
        self.assertEqual(self.visible(), ([1], [1]))
        # Editing another slot onto a removed time also reuses that row instead of breaking UNIQUE(provider_id, starts_at).
        self.identify(self.client, 3)
        self.change('delete')
        later = datetime.fromisoformat(original) + timedelta(hours=2)
        other = self.client.post('/api/provider/availability', json={'starts_at': later.isoformat()}, headers=self.headers).json['slot']['id']
        moved = self.client.patch(f'/api/provider/availability/{other}', json={'starts_at': original}, headers=self.headers)
        self.assertEqual((moved.status_code, moved.json['slot']['id']), (200, 1))
        self.assertEqual(self.visible(), ([1], [1]))

    def test_removed_slots_do_not_count_as_overlaps(self):
        original = self.cancelled_booking()
        self.identify(self.client, 3)
        self.change('delete')
        shifted = (datetime.fromisoformat(original) + timedelta(minutes=30)).isoformat()
        self.assertEqual(self.client.post('/api/provider/availability', json={'starts_at': shifted}, headers=self.headers).status_code, 201)

    def test_edit_rejects_times_off_the_half_hour(self):
        self.identify(self.client, 3)
        value = (datetime.now(timezone.utc) + timedelta(days=3)).replace(minute=10, second=0, microsecond=0).isoformat()
        self.assertEqual(self.change(value=value).status_code, 400)


class MigrationTest(unittest.TestCase):
    def test_existing_database_gains_removed_at_without_losing_rows(self):
        import tempfile
        from pathlib import Path
        from app import create_app
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'old.db'
            with closing(sqlite3.connect(path)) as db, db:
                db.execute('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, '
                           'password_hash TEXT NOT NULL, role TEXT NOT NULL)')
                db.execute('CREATE TABLE availability (id INTEGER PRIMARY KEY, provider_id INTEGER NOT NULL REFERENCES users(id), '
                           'starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, CHECK (starts_at < ends_at), UNIQUE (provider_id, starts_at))')
                db.execute("INSERT INTO users VALUES(1,'P','p@example.com','x','provider')")
                db.execute("INSERT INTO availability VALUES(1,1,'2099-01-01T10:00:00+00:00','2099-01-01T10:30:00+00:00')")
            create_app({'TESTING': True, 'DATABASE': str(path), 'SECRET_KEY': 'test'})
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(db.execute('SELECT id, starts_at, removed_at FROM availability').fetchall(),
                                 [(1, '2099-01-01T10:00:00+00:00', None)])
