from functools import wraps

from flask import jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash

VALID_ROLES = ("client", "provider", "admin")


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, password)


def require_role(*roles):
    """Restrict a route to logged-in users whose session role is in `roles`."""

    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if "user_id" not in session:
                return jsonify(error="not logged in"), 401
            if session.get("role") not in roles:
                return jsonify(error="forbidden"), 403
            return view(*args, **kwargs)

        return wrapped

    return decorator
