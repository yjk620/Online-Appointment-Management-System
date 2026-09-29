import sqlite3

from flask import Blueprint, jsonify, request, session

from auth import VALID_ROLES, get_session_user, hash_password, verify_password
from database import connect

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role")

    if not name or not email or not password:
        return jsonify(error="name, email, and password are required"), 400
    if role not in VALID_ROLES:
        return jsonify(error=f"role must be one of {VALID_ROLES}"), 400

    password_hash = hash_password(password)

    with connect() as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                (name, email, password_hash, role),
            )
        except sqlite3.IntegrityError:
            return jsonify(error="email already registered"), 409
        user_id = cursor.lastrowid

    return jsonify(id=user_id, name=name, email=email, role=role), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify(error="email and password are required"), 400

    with connect() as connection:
        user = connection.execute(
            "SELECT id, name, email, password_hash, role FROM users WHERE email = ?",
            (email,),
        ).fetchone()

    if user is None or not verify_password(password, user["password_hash"]):
        return jsonify(error="invalid email or password"), 401

    session.clear()
    session["user_id"] = user["id"]
    session["role"] = user["role"]

    return jsonify(id=user["id"], name=user["name"], email=user["email"], role=user["role"])


@auth_bp.post("/logout")
def logout():
    session.clear()
    return "", 204


@auth_bp.get("/me")
def me():
    user = get_session_user()
    if user is None:
        return jsonify(error="not logged in"), 401
    return jsonify(id=user["id"], name=user["name"], email=user["email"], role=user["role"])
