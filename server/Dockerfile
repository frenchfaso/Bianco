FROM docker.io/library/python:3.13.14-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt


FROM base AS development

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --no-access-log"]


FROM base AS test

COPY requirements-test.txt ./
RUN pip install --no-cache-dir -r requirements-test.txt


FROM base AS production

COPY . .

RUN useradd --system --uid 10001 --create-home bianco \
    && mkdir -p /data/files /data/backups \
    && chown -R bianco:bianco /app /data

USER bianco

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --no-access-log"]
