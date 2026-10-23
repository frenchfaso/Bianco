FROM docker.io/library/python:3.13.17-slim-trixie AS base

# Refresh Debian security fixes even when the upstream image tag is unchanged.
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge 20250419+deb13u1 \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./
# Both pip's vendored roots and application TLS clients need current certificates.
RUN python -m pip install --no-cache-dir --upgrade 'pip>=26.2.2' 'certifi>=2026.10.19' \
    && python -m pip install --no-cache-dir -r requirements.txt


FROM base AS development

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --no-access-log"]


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

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --no-access-log"]
