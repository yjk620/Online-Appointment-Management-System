import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from werkzeug.security import check_password_hash

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app  # noqa: E402


class RegistrationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "appointments.db"
        self.app = create_app({"TESTING": True, "DATABASE": str(self.database)})
        self.client = self.app.test_client()

    def tearDown(self):
        self.directory.cleanup()

    def test_registration_creates_client_with_hashed_password(self):
        response = self.client.post(
            "/api/register",
            json={"name": "Sam Client", "email": "  SAM@example.com ", "password": "samplepass123"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["email"], "sam@example.com")
        self.assertEqual(response.json["role"], "client")
        self.assertNotIn("password", response.json)
        with sqlite3.connect(self.database) as connection:
            row = connection.execute(
                "SELECT email, password_hash, role FROM users"
            ).fetchone()
        self.assertEqual(row[0], "sam@example.com")
        self.assertNotEqual(row[1], "samplepass123")
        self.assertTrue(check_password_hash(row[1], "samplepass123"))
        self.assertEqual(row[2], "client")

    def test_duplicate_email_returns_conflict(self):
        payload = {"name": "Sam Client", "email": "sam@example.com", "password": "samplepass123"}
        self.assertEqual(self.client.post("/api/register", json=payload).status_code, 201)
        payload["email"] = "SAM@example.com"
        response = self.client.post("/api/register", json=payload)
        self.assertEqual(response.status_code, 409)
        self.assertIn("already exists", response.json["error"])
        with sqlite3.connect(self.database) as connection:
            count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        self.assertEqual(count, 1)

    def test_missing_fields_and_short_password_are_rejected(self):
        self.assertEqual(self.client.post("/api/register", json={}).status_code, 400)
        response = self.client.post(
            "/api/register",
            json={"name": "Sam", "email": "sam@example.com", "password": "short"},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
