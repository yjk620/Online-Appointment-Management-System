from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app  # noqa: E402
from providers import DEMO_PASSWORD, DEMO_PROVIDERS  # noqa: E402


class ProviderSeedTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "test.db"
        self.app = create_app({"TESTING": True, "DATABASE": str(self.database), "SECRET_KEY": "test"})
        self.client = self.app.test_client()
        self.headers = {"X-Requested-With": "AppointmentDesk"}

    def tearDown(self):
        self.directory.cleanup()

    def seed(self):
        return self.app.test_cli_runner().invoke(args=["providers", "seed-demo"])

    def query(self, sql):
        with closing(sqlite3.connect(self.database)) as db:
            return db.execute(sql).fetchall()

    def test_at_least_four_providers_can_sign_in(self):
        result = self.seed()
        self.assertEqual(result.exit_code, 0, result.output)
        self.assertGreaterEqual(len(DEMO_PROVIDERS), 4)
        for _, email, *_ in DEMO_PROVIDERS:
            with self.subTest(email=email):
                response = self.client.post(
                    "/api/login", json={"email": email, "password": DEMO_PASSWORD}, headers=self.headers
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json["user"]["role"], "provider")

    def test_each_provider_has_distinct_future_availability(self):
        self.seed()
        now = datetime.now(timezone.utc)
        schedules = {}
        for provider_id, starts_at in self.query("SELECT provider_id, starts_at FROM availability"):
            self.assertGreater(datetime.fromisoformat(starts_at), now)
            schedules.setdefault(provider_id, set()).add(starts_at)
        self.assertEqual(len(schedules), len(DEMO_PROVIDERS))
        self.assertEqual(len({frozenset(times) for times in schedules.values()}), len(schedules))

    def test_providers_appear_in_client_directory_data(self):
        self.seed()
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO users(name,email,password_hash,role) VALUES('C','c@example.com','x','client')")
            client_id = db.execute("SELECT id FROM users WHERE email='c@example.com'").fetchone()[0]
        with self.client.session_transaction() as session:
            session["user_id"] = client_id
        options = self.client.get("/api/booking/options").json
        self.assertEqual({p["name"] for p in options["providers"]}, {name for name, *_ in DEMO_PROVIDERS})
        self.assertTrue(all(p["description"] for p in options["providers"]))
        self.assertEqual(len(options["slots"]), self.query("SELECT COUNT(*) FROM availability")[0][0])

    def test_seed_is_repeatable(self):
        self.seed()
        counts = self.query("SELECT (SELECT COUNT(*) FROM users), (SELECT COUNT(*) FROM availability)")
        result = self.seed()
        self.assertEqual(result.exit_code, 0, result.output)
        self.assertEqual(self.query("SELECT (SELECT COUNT(*) FROM users), (SELECT COUNT(*) FROM availability)"), counts)

    def test_existing_non_provider_email_is_not_converted(self):
        _, email, *_ = DEMO_PROVIDERS[-1]
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO users(name,email,password_hash,role) VALUES('Real Client',?,'x','client')", (email,))
        result = self.seed()
        self.assertNotEqual(result.exit_code, 0)
        self.assertEqual(self.query("SELECT role FROM users"), [("client",)])
        self.assertEqual(self.query("SELECT COUNT(*) FROM availability"), [(0,)])


if __name__ == "__main__":
    unittest.main()
