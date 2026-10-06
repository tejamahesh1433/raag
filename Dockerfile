# --- Build the frontend -----------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Runtime ----------------------------------------------------------------
FROM python:3.12-slim AS app
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 \
    MUSIC_DATA_DIR=/data \
    MUSIC_HOST=0.0.0.0 \
    MUSIC_PORT=8765 \
    MUSIC_COOKIE_SECURE=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libchromaprint-tools \
    && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt ./server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY server/ ./server/
COPY --from=web /build/dist ./web/dist

WORKDIR /srv/server
EXPOSE 8765
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
