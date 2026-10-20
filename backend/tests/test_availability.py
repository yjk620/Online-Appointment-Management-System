from contextlib import closing
from datetime import datetime, timedelta, timezone
import sqlite3
import unittest
import test_booking


def iso(value):
    return value.isoformat()


class ProviderAvailabilityTest(unittest.TestCase):
    """#10: providers create their own 30-minute slots and clients can book them."""
    setUp = test_booking.BookingTest.setUp
    tearDown = test_booking.BookingTest.tearDown
    identify = test_booking.BookingTest.identify

    def create(self, starts_at, client=None):
        return (client or self.client).post('/api/provider/availability', json={'starts_at': starts_at}, headers=self.headers)

    def update(self, slot_id, starts_at, client=None):
        return (client or self.client).patch(
            f'/api/provider/availability/{slot_id}', json={'starts_at': starts_at}, headers=self.headers
        )

    def delete(self, slot_id, client=None):
        return (client or self.client).delete(
            f'/api/provider/availability/{slot_id}', json={}, headers=self.headers
        )

    def future(self, days=3, hour=15):
        return (datetime.now(timezone.utc) + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)

    def test_provider_creates_30_minute_utc_slot(self):
        self.identify(self.client, 3)
        start = self.future()
        local = start.astimezone(timezone(timedelta(hours=-4))).isoformat()
        result = self.create(local)
        self.assertEqual(result.status_code, 201)
        slot = result.json['slot']
        self.assertEqual((slot['starts_at'], slot['ends_at'], slot['booked']), (iso(start), iso(start + timedelta(minutes=30)), False))
        with closing(sqlite3.connect(self.database)) as db:
            self.assertEqual(db.execute('SELECT provider_id, starts_at FROM availability WHERE id=?', (slot['id'],)).fetchone(), (3, iso(start)))

    def test_new_slot_is_visible_and_bookable_by_clients(self):
        self.identify(self.client, 3)
        slot_id = self.create(iso(self.future())).json['slot']['id']
        self.identify(self.client, 1)
        self.assertIn(slot_id, [slot['id'] for slot in self.client.get('/api/booking/options').json['slots']])
        self.assertEqual(self.client.post('/api/appointments', json={'availability_id': slot_id}, headers=self.headers).status_code, 201)

    def test_overlapping_slots_are_rejected(self):
        self.identify(self.client, 3)
        start = self.future()
        self.assertEqual(self.create(iso(start)).status_code, 201)
        for offset in (0, 15, -15):
            self.assertEqual(self.create(iso(start + timedelta(minutes=offset))).status_code, 409)
        self.assertEqual(self.create(iso(start + timedelta(minutes=30))).status_code, 201)
        self.assertEqual(self.create(iso(start - timedelta(minutes=30))).status_code, 201)

    def test_overlap_check_covers_existing_demo_slots(self):
        self.identify(self.client, 3)
        with closing(sqlite3.connect(self.database)) as db:
            existing = db.execute('SELECT starts_at FROM availability WHERE id=1').fetchone()[0]
        self.assertEqual(self.create(existing).status_code, 409)

    def test_invalid_and_past_times_are_rejected(self):
        self.identify(self.client, 3)
        for value in (None, '', 'tomorrow', '2099-01-01T10:00:00', 1700000000, True):
            self.assertEqual(self.create(value).status_code, 400, value)
        self.assertEqual(self.create(iso(datetime.now(timezone.utc) - timedelta(hours=1))).status_code, 400)
        self.assertEqual(self.client.post('/api/provider/availability', json={'starts_at': iso(self.future())}).status_code, 400)

    def test_provider_lists_only_own_future_slots_with_booked_flag(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO users VALUES(5,'other','5@example.com','unused','provider')")
            db.execute('INSERT INTO availability VALUES(3,5,?,?)', (iso(self.future()), iso(self.future() + timedelta(minutes=30))))
            db.execute('INSERT INTO appointments(client_id,availability_id) VALUES(1,1)')
        self.identify(self.client, 3)
        slots = self.client.get('/api/provider/availability').json['slots']
        self.assertEqual([(slot['id'], slot['booked']) for slot in slots], [(1, True)])
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("UPDATE appointments SET status='cancelled'")
        self.assertEqual(self.client.get('/api/provider/availability').json['slots'][0]['booked'], False)

    def test_only_providers_can_use_availability(self):
        for user, expected in ((1, 403), (4, 403), (999, 401)):
            self.identify(self.client, user)
            self.assertEqual(self.client.get('/api/provider/availability').status_code, expected)
            self.assertEqual(self.create(iso(self.future())).status_code, expected)
            self.assertEqual(self.update(1, iso(self.future())).status_code, expected)
            self.assertEqual(self.delete(1).status_code, expected)

    def test_provider_updates_open_slot_and_clients_see_the_change(self):
        self.identify(self.client, 3)
        changed = self.future(days=4, hour=18)
        result = self.update(1, iso(changed))
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['slot']['starts_at'], iso(changed))
        self.identify(self.client, 1)
        slots = self.client.get('/api/booking/options').json['slots']
        self.assertEqual([(slot['id'], slot['starts_at']) for slot in slots], [(1, iso(changed))])

    def test_provider_removes_open_slot_and_clients_no_longer_see_it(self):
        self.identify(self.client, 3)
        self.assertEqual(self.delete(1).status_code, 200)
        self.assertEqual(self.client.get('/api/provider/availability').json['slots'], [])
        self.identify(self.client, 1)
        self.assertEqual(self.client.get('/api/booking/options').json['slots'], [])

    def test_update_rejects_past_overlap_and_another_providers_slot(self):
        self.identify(self.client, 3)
        second = self.future(days=5, hour=16)
        second_id = self.create(iso(second)).json['slot']['id']
        self.assertEqual(self.update(1, iso(second + timedelta(minutes=15))).status_code, 409)
        self.assertEqual(self.update(1, iso(datetime.now(timezone.utc) - timedelta(hours=1))).status_code, 400)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO users VALUES(5,'other','5@example.com','unused','provider')")
            db.execute('INSERT INTO provider_profiles(user_id) VALUES(5)')
            db.execute('UPDATE availability SET provider_id=5 WHERE id=?', (second_id,))
        self.assertEqual(self.update(second_id, iso(self.future(days=6))).status_code, 404)
        self.assertEqual(self.delete(second_id).status_code, 404)

    def test_appointment_history_locks_slot_against_editing_and_removal(self):
        self.identify(self.client, 1)
        appointment = self.client.post('/api/appointments', json={'availability_id': 1}, headers=self.headers)
        self.assertEqual(appointment.status_code, 201)
        self.identify(self.client, 3)
        self.assertEqual(self.update(1, iso(self.future(days=7))).status_code, 409)
        self.assertEqual(self.delete(1).status_code, 409)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("UPDATE appointments SET status='cancelled'")
        slot = self.client.get('/api/provider/availability').json['slots'][0]
        self.assertEqual((slot['booked'], slot['locked']), (False, True))
        self.assertEqual(self.update(1, iso(self.future(days=7))).status_code, 409)
        self.assertEqual(self.delete(1).status_code, 409)

    def test_update_and_delete_require_trusted_json_request(self):
        self.identify(self.client, 3)
        start = iso(self.future(days=4))
        self.assertEqual(self.client.patch('/api/provider/availability/1', json={'starts_at': start}).status_code, 400)
        self.assertEqual(self.client.delete('/api/provider/availability/1', json={}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
