import os
import sqlite3
import secrets
from datetime import timedelta
from contextlib import closing
from pathlib import Path

from flask import Flask, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from database import connect, init_db
from booking import booking
from providers import providers


def create_app(test_config=None):
    app = Flask(__name__)
    app.register_blueprint(booking)
    app.register_blueprint(providers)
    app.config.update(
        SECRET_KEY=os.environ.get("APPOINTMENTS_SECRET_KEY") or secrets.token_hex(32),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("APPOINTMENTS_COOKIE_SECURE") == "1",
        PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    )
    app.config["DATABASE"] = os.environ.get(
        "APPOINTMENTS_DATABASE",
        str(Path(__file__).with_name("appointments.db")),
    )
    if test_config:
        app.config.update(test_config)

    with app.app_context():
        init_db()

    @app.before_request
    def protect_auth_requests():
        # JSON plus a custom header prevents cross-origin form submissions.
        if request.path in ("/api/login", "/api/logout") and request.method == "POST":
            if not request.is_json or request.headers.get("X-Requested-With") != "AppointmentDesk":
                return jsonify(error="Invalid request."), 400

    def public_user(user):
        return {key: user[key] for key in ("id", "name", "email", "role")}

    @app.post("/api/login")
    def login():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(error="Enter your email and password."), 400
        email, password = data.get("email"), data.get("password")
        if not isinstance(email, str) or not isinstance(password, str) or not email.strip() or not password:
            return jsonify(error="Enter your email and password."), 400
        with closing(connect()) as connection:
            user = connection.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            return jsonify(error="Invalid email or password."), 401
        session.clear()
        session["user_id"] = user["id"]
        session.permanent = True
        return jsonify(user=public_user(user))

    @app.get("/api/session")
    def current_session():
        with closing(connect()) as connection:
            user = connection.execute("SELECT * FROM users WHERE id = ?", (session.get("user_id"),)).fetchone()
        if user is None:
            session.clear()
            return jsonify(error="Please sign in."), 401
        response = jsonify(user=public_user(user))
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/api/logout")
    def logout():
        session.clear()
        return jsonify(message="Signed out.")

    @app.get("/api/health")
    def health():
        with closing(connect()) as connection:
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
