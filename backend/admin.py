"""Admin tools (#27): review provider sign-ups and create admin accounts.

Public registration can only create client or (pending) provider accounts.
An admin account exists only if someone with access to the server runs
`flask --app app admin create`.
"""
from contextlib import closing
from functools import wraps
import sqlite3

import click
from flask import Blueprint, jsonify, request, session
from werkzeug.security import generate_password_hash

from database import connect

admin = Blueprint("admin", __name__)


def admin_only(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        with closing(connect()) as db:
            user = db.execute("SELECT role FROM users WHERE id=?", (session.get("user_id"),)).fetchone()
        if user is None:
            return jsonify(error="Please sign in."), 401
        if user["role"] != "admin":
            return jsonify(error="This feature is available to admins only."), 403
        return view(*args, **kwargs)
    return wrapped


def trusted_json_request():
    # JSON plus the custom header blocks cross-site form submissions, as in booking.
    return request.is_json and request.headers.get("X-Requested-With") == "AppointmentDesk"


@admin.after_request
def prevent_caching(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@admin.get("/api/admin/provider-applications")
@admin_only
def provider_applications():
    with closing(connect()) as db:
        rows = db.execute(
            "SELECT u.id, u.name, u.email, p.requested_at FROM pending_providers p "
            "JOIN users u ON u.id = p.user_id ORDER BY p.requested_at, u.id"
        ).fetchall()
    return jsonify(applications=[dict(row) for row in rows])


@admin.post("/api/admin/provider-applications/<int:user_id>/approve")
@admin_only
def approve_provider(user_id):
    if not trusted_json_request():
        return jsonify(error="Invalid request."), 400
    with closing(connect()) as db, db:
        if db.execute("DELETE FROM pending_providers WHERE user_id = ?", (user_id,)).rowcount == 0:
            return jsonify(error="This application is no longer waiting for review."), 404
        # A profile is what makes an approved provider appear to clients.
        db.execute("INSERT OR IGNORE INTO provider_profiles (user_id) VALUES (?)", (user_id,))
    return jsonify(message="Provider approved.")


@admin.post("/api/admin/provider-applications/<int:user_id>/reject")
@admin_only
def reject_provider(user_id):
    if not trusted_json_request():
        return jsonify(error="Invalid request."), 400
    with closing(connect()) as db, db:
        # Deleting the pending account (its pending row cascades) frees the email.
        deleted = db.execute(
            "DELETE FROM users WHERE id = ? AND id IN (SELECT user_id FROM pending_providers)", (user_id,)
        ).rowcount
    if deleted == 0:
        return jsonify(error="This application is no longer waiting for review."), 404
    return jsonify(message="Application rejected.")


@admin.cli.command("create")
@click.option("--name", prompt="Full name")
@click.option("--email", prompt="Email address")
@click.password_option()
def create_admin(name, email, password):
    """Create an admin account. This is the only way to create one."""
    name, email = name.strip(), email.strip().lower()
    if not name or "@" not in email or email.startswith("@") or email.endswith("@"):
        raise click.ClickException("Enter a name and a valid email address.")
    if len(password) < 8:
        raise click.ClickException("Password must be at least 8 characters.")
    with closing(connect()) as db, db:
        try:
            db.execute(
                "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
                (name, email, generate_password_hash(password)),
            )
        except sqlite3.IntegrityError:
            raise click.ClickException("An account with this email already exists.") from None
    click.echo(f"Admin account created for {email}.")
