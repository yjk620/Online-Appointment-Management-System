from contextlib import closing
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app  # noqa: E402


class SetupTest(unittest.TestCase):
    def test_health_and_initial_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "appointments.db"
            app = create_app({"TESTING": True, "DATABASE": str(database_path)})
            response = app.test_client().get("/api/health")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, {"status": "ok", "database": "ok"})
            with closing(sqlite3.connect(database_path)) as connection, connection:
                tables = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    )
                }
                self.assertTrue(
                    {"users", "provider_profiles", "availability", "appointments"}
                    <= tables
                )


if __name__ == "__main__":
    unittest.main()
