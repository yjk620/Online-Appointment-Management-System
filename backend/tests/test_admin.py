from contextlib import closing
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

from werkzeug.security import generate_password_hash

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app  # noqa: E402

HEADERS = {"X-Requested-With": "AppointmentDesk"}
PASSWORD = "password123"


class AdminTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "test.db"
        self.app = create_app({"TESTING": True, "DATABASE": str(self.database), "SECRET_KEY": "test"})
        with closing(sqlite3.connect(self.database)) as db, db:
            for role in ("client", "provider", "admin"):
                db.execute(
                    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                    (role.title(), f"{role}@example.com", generate_password_hash(PASSWORD), role),
                )

    def tearDown(self):
        self.directory.cleanup()

    def query(self, sql, *params):
        with closing(sqlite3.connect(self.database)) as db:
            return db.execute(sql, params).fetchall()

    def signed_in(self, email):
        client = self.app.test_client()
        response = client.post("/api/login", json={"email": email, "password": PASSWORD}, headers=HEADERS)
        self.assertEqual(response.status_code, 200)
        return client

    def apply_as_provider(self, email):
        response = self.app.test_client().post(
            "/api/register", json={"name": email.split("@")[0], "email": email, "password": PASSWORD, "account_type": "provider"}
        )
        self.assertEqual(response.status_code, 201)
        return response.json["id"]

    def decide(self, client, user_id, decision, **request):
        return client.post(f"/api/admin/provider-applications/{user_id}/{decision}", **(request or {"json": {}, "headers": HEADERS}))

    def create_admin(self, *args, **kwargs):
        return self.app.test_cli_runner().invoke(args=["admin", "create", *args], **kwargs)

    def test_only_admins_can_review_applications(self):
        pending_id = self.apply_as_provider("pat@example.com")
        for email, expected in ((None, 401), ("client@example.com", 403), ("provider@example.com", 403)):
            with self.subTest(signed_in_as=email):
                client = self.app.test_client() if email is None else self.signed_in(email)
                self.assertEqual(client.get("/api/admin/provider-applications").status_code, expected)
                self.assertEqual(self.decide(client, pending_id, "approve").status_code, expected)
                self.assertEqual(self.decide(client, pending_id, "reject").status_code, expected)
        response = self.signed_in("admin@example.com").get("/api/admin/provider-applications")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        [application] = response.json["applications"]
        self.assertEqual((application["id"], application["email"]), (pending_id, "pat@example.com"))
        self.assertEqual(set(application), {"id", "name", "email", "requested_at"})

    def test_list_shows_only_pending_applications(self):
        first, second = self.apply_as_provider("a@example.com"), self.apply_as_provider("b@example.com")
        admin = self.signed_in("admin@example.com")
        self.assertEqual([a["id"] for a in admin.get("/api/admin/provider-applications").json["applications"]], [first, second])
        self.assertEqual(self.decide(admin, first, "approve").status_code, 200)
        self.assertEqual([a["id"] for a in admin.get("/api/admin/provider-applications").json["applications"]], [second])

    def test_decisions_require_json_and_custom_header(self):
        pending_id = self.apply_as_provider("pat@example.com")
        admin = self.signed_in("admin@example.com")
        for decision in ("approve", "reject"):
            self.assertEqual(self.decide(admin, pending_id, decision, json={}).status_code, 400)
            self.assertEqual(self.decide(admin, pending_id, decision, data={}, headers=HEADERS).status_code, 400)
        self.assertEqual(self.query("SELECT user_id FROM pending_providers"), [(pending_id,)])

    def test_decisions_apply_only_to_pending_applications(self):
        pending_id = self.apply_as_provider("pat@example.com")
        admin = self.signed_in("admin@example.com")
        client_id, provider_id = (self.query("SELECT id FROM users WHERE email = ?", f"{r}@example.com")[0][0] for r in ("client", "provider"))
        self.assertEqual(self.decide(admin, 999, "approve").status_code, 404)
        self.assertEqual(self.decide(admin, pending_id, "approve").status_code, 200)
        self.assertEqual(self.decide(admin, pending_id, "approve").status_code, 404)
        for user_id in (pending_id, client_id, provider_id):
            self.assertEqual(self.decide(admin, user_id, "reject").status_code, 404)
        self.assertEqual(self.query("SELECT COUNT(*) FROM users"), [(4,)])

    def test_create_admin_command_prompts_for_details(self):
        result = self.create_admin(input="Ada Admin\n ADA@example.com \nadmin-pass-1\nadmin-pass-1\n")
        self.assertEqual(result.exit_code, 0, result.output)
        self.assertNotIn("admin-pass-1", result.output)
        response = self.app.test_client().post(
            "/api/login", json={"email": "ada@example.com", "password": "admin-pass-1"}, headers=HEADERS
        )
        self.assertEqual((response.status_code, response.json["user"]["role"]), (200, "admin"))

    def test_create_admin_command_rejects_bad_input(self):
        cases = (
            ("--name", "Dup", "--email", "client@example.com", "--password", "admin-pass-1"),
            ("--name", "Short", "--email", "short@example.com", "--password", "short"),
            ("--name", "Bad", "--email", "not-an-email", "--password", "admin-pass-1"),
        )
        for args in cases:
            with self.subTest(args=args):
                self.assertNotEqual(self.create_admin(*args).exit_code, 0)
        mismatch = self.create_admin(input="Mis Match\nmis@example.com\nadmin-pass-1\nadmin-pass-2\n")
        self.assertNotEqual(mismatch.exit_code, 0)
        self.assertEqual(self.query("SELECT email FROM users WHERE role = 'admin'"), [("admin@example.com",)])


if __name__ == "__main__":
    unittest.main()
