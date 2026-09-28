import os
from pathlib import Path

from flask import Flask, jsonify

from auth_routes import auth_bp
from database import connect, init_db


def create_app(test_config=None):
    app = Flask(__name__)
    app.config["DATABASE"] = os.environ.get(
        "APPOINTMENTS_DATABASE",
        str(Path(__file__).with_name("appointments.db")),
    )
    app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")
    if test_config:
        app.config.update(test_config)

    with app.app_context():
        init_db()

    app.register_blueprint(auth_bp)

    @app.get("/api/health")
    def health():
        with connect() as connection:
            connection.execute("SELECT 1").fetchone()
        return jsonify(status="ok", database="ok")

    return app


app = create_app()
