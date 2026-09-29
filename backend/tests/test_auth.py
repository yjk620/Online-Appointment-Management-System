import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app  # noqa: E402
from auth import require_role  # noqa: E402
from database import connect  # noqa: E402
from flask import g  # noqa: E402


class AuthTestCase(unittest.TestCase):
    def setUp(self):
        self._tempdir = tempfile.TemporaryDirectory()
        database_path = Path(self._tempdir.name) / "appointments.db"
        self.app = create_app({"TESTING": True, "DATABASE": str(database_path)})

        # A protected test-only route to exercise require_role/g.user.
        @self.app.get("/api/test/client-only")
        @require_role("client")
        def client_only_route():
            return {"user_id": g.user["id"], "role": g.user["role"]}

        self.client = self.app.test_client()

    def tearDown(self):
        self._tempdir.cleanup()

    def register(self, **overrides):
        data = {
            "name": "Kevin",
            "email": "kevin@tmu.ca",
            "password": "pw123",
            "role": "client",
        }
        data.update(overrides)
        return self.client.post("/api/auth/register", json=data)

    # --- registration ---

    def test_register_success(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["role"], "client")

    def test_register_duplicate_email_rejected(self):
        self.register()
        response = self.register(name="Someone Else")
        self.assertEqual(response.status_code, 409)

    def test_register_invalid_role_rejected(self):
        response = self.register(role="wizard")
        self.assertEqual(response.status_code, 400)

    def test_register_missing_fields_rejected(self):
        response = self.client.post("/api/auth/register", json={"email": "x@tmu.ca"})
        self.assertEqual(response.status_code, 400)

    # --- login / logout ---

    def test_login_success(self):
        self.register()
        response = self.client.post(
            "/api/auth/login", json={"email": "kevin@tmu.ca", "password": "pw123"}
        )
        self.assertEqual(response.status_code, 200)

    def test_login_wrong_password_rejected(self):
        self.register()
        response = self.client.post(
            "/api/auth/login", json={"email": "kevin@tmu.ca", "password": "wrong"}
        )
        self.assertEqual(response.status_code, 401)

    def test_login_unknown_email_rejected(self):
        response = self.client.post(
            "/api/auth/login", json={"email": "nobody@tmu.ca", "password": "pw123"}
        )
        self.assertEqual(response.status_code, 401)

    def test_logout_clears_session(self):
        self.register()
        self.client.post(
            "/api/auth/login", json={"email": "kevin@tmu.ca", "password": "pw123"}
        )
        self.client.post("/api/auth/logout")
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)

    # --- /me ---

    def test_me_requires_login(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)

    def test_me_returns_current_user(self):
        self.register()
        self.client.post(
            "/api/auth/login", json={"email": "kevin@tmu.ca", "password": "pw123"}
        )
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["email"], "kevin@tmu.ca")

    # --- require_role / g.user ---

    def test_require_role_blocks_signed_out_user(self):
        response = self.client.get("/api/test/client-only")
        self.assertEqual(response.status_code, 401)

    def test_require_role_blocks_wrong_role(self):
        self.register(email="provider@tmu.ca", role="provider")
        self.client.post(
            "/api/auth/login", json={"email": "provider@tmu.ca", "password": "pw123"}
        )
        response = self.client.get("/api/test/client-only")
        self.assertEqual(response.status_code, 403)

    def test_require_role_allows_correct_role_and_sets_g_user(self):
        self.register()
        self.client.post(
            "/api/auth/login", json={"email": "kevin@tmu.ca", "password": "pw123"}
        )
        response = self.client.get("/api/test/client-only")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"user_id": 1, "role": "client"})

    def test_require_role_reflects_role_change_without_relogin(self):
        # get_session_user() re-reads from the DB, so a role change should
        # take effect on the very next request, not just the next login.
        self.register()
        self.client.post(
            "/api/auth/login", json={"email": "kevin@tmu.ca", "password": "pw123"}
        )
        with self.app.app_context():
            with connect() as connection:
                connection.execute(
                    "UPDATE users SET role = 'provider' WHERE email = ?",
                    ("kevin@tmu.ca",),
                )

        response = self.client.get("/api/test/client-only")
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
