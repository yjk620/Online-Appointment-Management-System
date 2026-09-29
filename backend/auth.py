from functools import wraps

from flask import g, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash

from database import connect

VALID_ROLES = ("client", "provider", "admin")


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, password)


def get_session_user():
    """Return the signed-in user's fresh row from the DB, or None.

    Re-reading from the DB (rather than trusting the session's cached role)
    means a role change or account deletion takes effect on the next
    request, not just the next login.
    """
    user_id = session.get("user_id")
    if user_id is None:
        return None
    with connect() as connection:
        user = connection.execute(
            "SELECT id, name, email, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if user is None:
        session.clear()
    return user


def require_role(*roles):
    """Restrict a route to signed-in users whose current role is in `roles`.

    Sets flask.g.user to the authenticated user's row for the view to use.
    """

    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = get_session_user()
            if user is None:
                return jsonify(error="not logged in"), 401
            if user["role"] not in roles:
                return jsonify(error="forbidden"), 403
            g.user = user
            return view(*args, **kwargs)

        return wrapped

    return decorator
