# One image for Railway: build the React site, then serve it and the Flask API from one address.

FROM node:22-slim AS site
WORKDIR /site
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt gunicorn==23.0.0
COPY backend/ ./
COPY --from=site /site/dist ./site
# Makes `flask providers seed-demo` and `flask admin create` in Railway's shell use the server's database.
ENV FLASK_APP=serve
# Railway sets PORT; gunicorn binds 0.0.0.0:$PORT on its own.
CMD ["gunicorn", "--preload", "--workers", "2", "--access-logfile", "-", "serve:app"]
