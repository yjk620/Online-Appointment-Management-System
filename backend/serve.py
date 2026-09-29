"""Production entry point for Railway (`gunicorn serve:app`).

Serves the Flask API and the built React site from one address, so sign-in
cookies and the X-Requested-With check work exactly as in local development.
"""
import os
from pathlib import Path

# Fail fast on setup mistakes that would otherwise lose data or sign-ins silently.
volume = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH")
if not volume:
    raise RuntimeError("Attach a Railway volume: the database must live on it to survive redeploys.")
if not os.environ.get("APPOINTMENTS_SECRET_KEY"):
    raise RuntimeError("Set APPOINTMENTS_SECRET_KEY: without it, every restart signs everyone out.")
os.environ["APPOINTMENTS_DATABASE"] = str(Path(volume) / "appointments.db")
os.environ.setdefault("APPOINTMENTS_COOKIE_SECURE", "1")

from flask import abort, send_from_directory  # noqa: E402
from werkzeug.exceptions import NotFound  # noqa: E402

from app import app  # noqa: E402

SITE = Path(__file__).resolve().parent / "site"
if not (SITE / "index.html").is_file():
    raise RuntimeError(f"Built React site not found at {SITE}; the Docker build copies it there.")


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def serve_site(path):
    """Send a built file if it exists, else the React app, which picks the page from the URL."""
    if path == "api" or path.startswith("api/"):
        abort(404)
    try:
        return send_from_directory(SITE, path or "index.html")
    except NotFound:
        return send_from_directory(SITE, "index.html")
