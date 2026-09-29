from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app


class BookingTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / 'test.db'
        self.app = create_app({'TESTING': True, 'DATABASE': str(self.database), 'SECRET_KEY': 'test'})
        self.client = self.app.test_client()
        self.headers = {'X-Requested-With': 'AppointmentDesk'}
        with closing(sqlite3.connect(self.database)) as db, db:
            for id, role in ((1, 'client'), (2, 'client'), (3, 'provider'), (4, 'admin')):
                db.execute('INSERT INTO users VALUES(?,?,?,?,?)', (id, role, f'{id}@example.com', 'unused', role))
            db.execute('INSERT INTO provider_profiles(user_id) VALUES(3)')
            start = datetime.now(timezone.utc) + timedelta(days=1)
            for id, time in ((1, start), (2, start - timedelta(days=2))):
                db.execute('INSERT INTO availability VALUES(?,?,?,?)', (id, 3, time.isoformat(), (time + timedelta(minutes=30)).isoformat()))
        self.identify(self.client, 1)

    def tearDown(self):
        self.directory.cleanup()

    def identify(self, client, user_id):
        with client.session_transaction() as session:
            session['user_id'] = user_id

    def book(self, client=None, **payload):
        return (client or self.client).post('/api/appointments', json={'availability_id': 1, **payload}, headers=self.headers)

    def test_booking_persists_and_removes_slot(self):
        self.assertEqual(len(self.client.get('/api/booking/options').json['slots']), 1)
        result = self.book(client_id=2, status='completed')
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.json['appointment']['status'], 'scheduled')
        self.assertEqual(self.client.get('/api/booking/options').json['slots'], [])
        with closing(sqlite3.connect(self.database)) as db:
            self.assertEqual(db.execute('SELECT client_id,status FROM appointments').fetchone(), (1, 'scheduled'))

    def test_concurrent_booking_has_exactly_one_winner(self):
        clients = [self.app.test_client(), self.app.test_client()]
        for index, client in enumerate(clients):
            self.identify(client, index + 1)
        with ThreadPoolExecutor(max_workers=2) as pool:
            codes = list(pool.map(lambda client: self.book(client).status_code, clients))
        self.assertEqual(sorted(codes), [201, 409])

    def test_invalid_missing_past_and_duplicate_slots(self):
        for value in (True, '1', 0, -1, None):
            self.assertEqual(self.book(availability_id=value).status_code, 400)
        self.assertEqual(self.book(availability_id=999).status_code, 404)
        self.assertEqual(self.book(availability_id=2).status_code, 409)
        self.assertEqual(self.book().status_code, 201)
        self.assertEqual(self.book().status_code, 409)

    def test_only_existing_clients_can_book_or_read_options(self):
        for user, expected in ((3, 403), (4, 403), (999, 401)):
            self.identify(self.client, user)
            self.assertEqual(self.book().status_code, expected)
            self.assertEqual(self.client.get('/api/booking/options').status_code, expected)

    def test_custom_header_required(self):
        self.assertEqual(self.client.post('/api/appointments', json={'availability_id': 1}).status_code, 400)

    def test_cancelled_slot_can_be_booked_again(self):
        self.book()
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("UPDATE appointments SET status='cancelled'")
        self.assertEqual(len(self.client.get('/api/booking/options').json['slots']), 1)
        self.assertEqual(self.book().status_code, 201)

    def test_non_provider_slot_is_rejected(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("UPDATE users SET role='client' WHERE id=3")
        self.assertEqual(self.book().status_code, 404)
        self.assertEqual(self.client.get('/api/booking/options').json['slots'], [])

    def test_seed_is_repeatable(self):
        runner = self.app.test_cli_runner()
        for _ in range(2):
            result = runner.invoke(args=['booking', 'seed-demo'])
            self.assertEqual(result.exit_code, 0, result.output)
        with closing(sqlite3.connect(self.database)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM availability').fetchone()[0], 6)
