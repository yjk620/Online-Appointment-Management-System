import sqlite3

from flask import Blueprint, jsonify, request

from auth import VALID_ROLES, hash_password
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
