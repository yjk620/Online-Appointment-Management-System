import os
import sqlite3
from contextlib import closing
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.security import generate_password_hash

from database import connect, init_db


def create_app(test_config=None):
    app = Flask(__name__)
    app.config["DATABASE"] = os.environ.get(
        "APPOINTMENTS_DATABASE",
        str(Path(__file__).with_name("appointments.db")),
    )
    if test_config:
        app.config.update(test_config)

    with app.app_context():
        init_db()

    @app.get("/api/health")
    def health():
        with connect() as connection:
            connection.execute("SELECT 1").fetchone()
        return jsonify(status="ok", database="ok")

    @app.post("/api/register")
    def register():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(error="Enter your name, email, and password."), 400

        name = data.get("name")
        email = data.get("email")
        password = data.get("password")
        if not all(isinstance(value, str) for value in (name, email, password)):
            return jsonify(error="Enter your name, email, and password."), 400

        name = name.strip()
        email = email.strip().lower()
        if not name or not email or not password:
            return jsonify(error="Enter your name, email, and password."), 400
        if "@" not in email or email.startswith("@") or email.endswith("@"):
            return jsonify(error="Enter a valid email address."), 400
        if len(password) < 8:
            return jsonify(error="Password must be at least 8 characters."), 400

        with closing(connect()) as connection:
            try:
                cursor = connection.execute(
                    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'client')",
                    (name, email, generate_password_hash(password)),
                )
                connection.commit()
            except sqlite3.IntegrityError:
                connection.rollback()
                return jsonify(error="An account with this email already exists."), 409

        return jsonify(id=cursor.lastrowid, name=name, email=email, role="client"), 201

    return app


app = create_app()
