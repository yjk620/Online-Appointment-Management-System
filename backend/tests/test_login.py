from contextlib import closing
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app


class LoginTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / 'appointments.db'
        self.app = create_app({'TESTING': True, 'DATABASE': str(self.database), 'SECRET_KEY': 'test-only-secret'})
        self.client = self.app.test_client()
        self.headers = {'X-Requested-With': 'AppointmentDesk'}
        self.credentials = {'email': 'client@example.com', 'password': 'test-password'}
        self.client.post('/api/register', json={**self.credentials, 'name': 'Test Client'})

    def tearDown(self):
        self.directory.cleanup()

    def login(self, credentials=None):
        return self.client.post('/api/login', json=credentials or self.credentials, headers=self.headers)

    def test_registered_client_can_login_and_restore_session(self):
        response = self.login({**self.credentials, 'email': ' CLIENT@example.com '})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['user']['role'], 'client')
        self.assertNotIn('password_hash', response.json['user'])
        cookie = response.headers['Set-Cookie']
        self.assertIn('HttpOnly', cookie)
        self.assertIn('SameSite=Lax', cookie)
        self.assertIn('Expires=', cookie)
        restored = self.client.get('/api/session')
        self.assertEqual(restored.json, response.json)
        self.assertEqual(restored.headers['Cache-Control'], 'no-store')

    def test_invalid_credentials_share_generic_error(self):
        wrong_password = self.login({**self.credentials, 'password': 'wrong'})
        unknown_user = self.login({**self.credentials, 'email': 'unknown@example.com'})
        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(unknown_user.status_code, 401)
        self.assertEqual(wrong_password.json, unknown_user.json)
        self.assertEqual(self.client.get('/api/session').status_code, 401)

    def test_invalid_payloads_are_rejected(self):
        for data in ({}, [], {'email': 123, 'password': 'pass'}, {'email': ' ', 'password': ''}):
            with self.subTest(data=data):
                self.assertEqual(self.client.post('/api/login', json=data, headers=self.headers).status_code, 400)

    def test_each_role_is_restored_from_database(self):
        for role in ('client', 'provider', 'admin'):
            with self.subTest(role=role):
                with closing(sqlite3.connect(self.database)) as connection, connection:
                    connection.execute('UPDATE users SET role = ?', (role,))
                self.assertEqual(self.login().json['user']['role'], role)
                self.assertEqual(self.client.get('/api/session').json['user']['role'], role)

    def test_logout_clears_session(self):
        self.login()
        response = self.client.post('/api/logout', json={}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/api/session').status_code, 401)

    def test_deleted_user_session_is_rejected(self):
        self.login()
        with closing(sqlite3.connect(self.database)) as connection, connection:
            connection.execute('DELETE FROM users')
        self.assertEqual(self.client.get('/api/session').status_code, 401)

    def test_auth_posts_require_json_and_custom_header(self):
        for endpoint in ('/api/login', '/api/logout'):
            self.assertEqual(self.client.post(endpoint, json=self.credentials).status_code, 400)
            self.assertEqual(self.client.post(endpoint, data=self.credentials, headers=self.headers).status_code, 400)

    def test_forged_cookie_is_rejected(self):
        self.client.set_cookie('session', 'forged-session')
        self.assertEqual(self.client.get('/api/session').status_code, 401)


if __name__ == '__main__':
    unittest.main()
