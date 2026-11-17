from contextlib import closing
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

from werkzeug.security import check_password_hash

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app  # noqa: E402


class SampleDataTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "test.db"
        self.app = create_app({"TESTING": True, "DATABASE": str(self.database), "SECRET_KEY": "test"})
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO users(name,email,password_hash,role) VALUES('Real','real@example.com','x','client')")

    def tearDown(self):
        self.directory.cleanup()

    def run_command(self, name):
        result = self.app.test_cli_runner().invoke(args=["sample", name])
        self.assertEqual(result.exit_code, 0, result.output)

    def counts(self):
        with closing(sqlite3.connect(self.database)) as db:
            return tuple(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                         for table in ("users", "availability", "appointments", "pending_providers"))

    def test_seed_is_repeatable_and_covers_every_status(self):
        self.run_command("seed")
        first = self.counts()
        self.run_command("seed")
        self.assertEqual(self.counts(), first)
        with closing(sqlite3.connect(self.database)) as db:
            statuses = {row[0] for row in db.execute("SELECT DISTINCT status FROM appointments")}
        self.assertEqual(statuses, {"scheduled", "completed", "cancelled", "no-show"})
        self.assertEqual(first[3], 3)

    def test_sample_accounts_can_sign_in_but_the_admin_cannot(self):
        self.run_command("seed")
        client = self.app.test_client()
        headers = {"X-Requested-With": "AppointmentDesk"}
        for email in ("provider@edge.example.invalid", "casey@edge.example.invalid"):
            self.assertEqual(client.post("/api/login", json={"email": email, "password": "password123"}, headers=headers).status_code, 200)
        with closing(sqlite3.connect(self.database)) as db:
            [admin_hash] = db.execute("SELECT password_hash FROM users WHERE role='admin'").fetchone()
        self.assertFalse(check_password_hash(admin_hash, "password123"))

    def test_remove_deletes_only_sample_rows(self):
        self.run_command("seed")
        self.run_command("remove")
        self.assertEqual(self.counts(), (1, 0, 0, 0))


if __name__ == "__main__":
    unittest.main()
