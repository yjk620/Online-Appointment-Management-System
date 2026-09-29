from contextlib import closing
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app  # noqa: E402

HEADERS = {"X-Requested-With": "AppointmentDesk"}


class AccountTypeTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "test.db"
        self.app = create_app({"TESTING": True, "DATABASE": str(self.database), "SECRET_KEY": "test"})
        self.client = self.app.test_client()

    def tearDown(self):
        self.directory.cleanup()

    def register(self, email="pat@example.com", **fields):
        return self.client.post("/api/register", json={"name": "Pat", "email": email, "password": "password123", **fields})

    def login(self, client, email, password="password123"):
        return client.post("/api/login", json={"email": email, "password": password}, headers=HEADERS)

    def signed_in(self, email, password="password123"):
        client = self.app.test_client()
        self.assertEqual(self.login(client, email, password).status_code, 200)
        return client

    def signed_in_admin(self):
        result = self.app.test_cli_runner().invoke(
            args=["admin", "create", "--name", "Ada", "--email", "ada@example.com", "--password", "admin-pass-1"]
        )
        self.assertEqual(result.exit_code, 0, result.output)
        return self.signed_in("ada@example.com", "admin-pass-1")

    def decide(self, admin, user_id, decision):
        return admin.post(f"/api/admin/provider-applications/{user_id}/{decision}", json={}, headers=HEADERS)

    def provider_names_seen_by_a_client(self):
        self.register(email="viewer@example.com")
        viewer = self.signed_in("viewer@example.com")
        return {provider["name"] for provider in viewer.get("/api/booking/options").json["providers"]}

    def test_registration_defaults_to_client(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertEqual((response.json["role"], response.json["pending_approval"]), ("client", False))
        self.assertEqual(self.login(self.client, "pat@example.com").status_code, 200)

    def test_public_registration_cannot_create_admins(self):
        for index, value in enumerate(("admin", "Provider", "", None, 1)):
            with self.subTest(account_type=value):
                self.assertEqual(self.register(email=f"p{index}@example.com", account_type=value).status_code, 400)
        self.assertEqual(self.register(role="admin").json["role"], "client")  # a raw role field is ignored
        with closing(sqlite3.connect(self.database)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0], 0)

    def test_provider_waits_for_approval_before_signing_in(self):
        response = self.register(account_type="provider")
        self.assertEqual(response.status_code, 201)
        self.assertEqual((response.json["role"], response.json["pending_approval"]), ("provider", True))
        pending = self.login(self.client, "pat@example.com")
        self.assertEqual(pending.status_code, 403)
        self.assertIn("waiting for admin approval", pending.json["error"])
        self.assertEqual(self.client.get("/api/session").status_code, 401)
        self.assertEqual(self.client.get("/api/booking/options").status_code, 401)
        wrong = self.login(self.client, "pat@example.com", "wrong-password")
        self.assertEqual((wrong.status_code, wrong.json["error"]), (401, "Invalid email or password."))
        self.assertNotIn("Pat", self.provider_names_seen_by_a_client())

    def test_approved_provider_can_sign_in_and_is_listed(self):
        user_id = self.register(account_type="provider").json["id"]
        self.assertEqual(self.decide(self.signed_in_admin(), user_id, "approve").status_code, 200)
        response = self.login(self.client, "pat@example.com")
        self.assertEqual((response.status_code, response.json["user"]["role"]), (200, "provider"))
        self.assertIn("Pat", self.provider_names_seen_by_a_client())

    def test_rejected_application_removes_account_and_frees_email(self):
        user_id = self.register(account_type="provider").json["id"]
        self.assertEqual(self.decide(self.signed_in_admin(), user_id, "reject").status_code, 200)
        self.assertEqual(self.login(self.client, "pat@example.com").status_code, 401)
        self.assertEqual(self.register().status_code, 201)


if __name__ == "__main__":
    unittest.main()
