import os
from pathlib import Path

os.environ["BIANCO_DATABASE_URL"] = "sqlite:////tmp/bianco-pytest.db"
os.environ["BIANCO_DATA_DIR"] = "/tmp/bianco-pytest-data"
os.environ["BIANCO_SYNC_TOKEN"] = "test-token"
os.environ["BIANCO_AI_PROVIDER"] = "none"

from alembic import command
from alembic.config import Config
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database import SessionLocal, engine
from app.main import app
from app.models import SyncDocument, SyncSequence


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    database = Path("/tmp/bianco-pytest.db")
    database.unlink(missing_ok=True)
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    yield
    engine.dispose()
    for suffix in ("", "-wal", "-shm"):
        Path(f"/tmp/bianco-pytest.db{suffix}").unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def clean_database(migrated_database):
    with SessionLocal() as session:
        session.execute(delete(SyncDocument))
        session.execute(delete(SyncSequence))
        session.commit()


@pytest.fixture()
def client():
    with TestClient(app) as value:
        yield value


@pytest.fixture()
def auth_headers():
    return {"Authorization": "Bearer test-token"}
