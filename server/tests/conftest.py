import os
import shutil
from pathlib import Path

os.environ["BIANCO_DATABASE_URL"] = "sqlite:////tmp/bianco-pytest.db"
os.environ["BIANCO_DATA_DIR"] = "/tmp/bianco-pytest-data"
os.environ["BIANCO_SYNC_TOKEN"] = "test-token"
os.environ["BIANCO_SECRET_KEY"] = "test-secret-key-that-is-at-least-32-characters"
os.environ["BIANCO_AUTH_USER"] = "test-user"
os.environ["BIANCO_AUTH_PASSWORD_HASH"] = "$2y$05$wIb9ZBmxVX2BJzYghjpQX.J2xJpUcYs78ZZFa0DnH52HukX7o0SfG"
os.environ["BIANCO_SESSION_COOKIE_SECURE"] = "false"
os.environ["BIANCO_AI_PROVIDER"] = "none"
os.environ["BIANCO_AI_WORKER_ENABLED"] = "false"
os.environ["OPENAI_COMPATIBLE_MODEL"] = "compatible-test"
os.environ["OLLAMA_MODEL"] = "vision:latest"

from alembic import command
from alembic.config import Config
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database import SessionLocal, engine
from app.main import app
from app.models import (
    AIExtractionJob,
    AIProviderConfiguration,
    AISettings,
    SyncDocument,
    SyncSequence,
)


class FakeOpenAICodexService:
    def __init__(self):
        self.connected = False
        self.plan_type = None
        self.logged_out = False
        self.models = [
            {
                "id": "gpt-codex-test",
                "displayName": "GPT Codex Test",
                "description": "Test model",
                "isDefault": True,
                "defaultReasoningEffort": "medium",
                "inputModalities": ["text", "image"],
            }
        ]

    async def account_status(self):
        return {"connected": self.connected, "planType": self.plan_type}

    async def start_device_login(self):
        return {
            "loginId": "login-test",
            "verificationUrl": "https://auth.openai.com/codex/device",
            "userCode": "TEST-CODE",
        }

    async def login_status(self, login_id):
        return {
            "connected": self.connected,
            "planType": self.plan_type,
            "status": "connected" if self.connected else "pending",
        }

    async def list_models(self):
        if not self.connected:
            raise PermissionError("Connect a ChatGPT subscription first")
        return self.models

    async def logout(self):
        self.connected = False
        self.plan_type = None
        self.logged_out = True

    async def structured_completion(self, **_kwargs):
        raise AssertionError("Unexpected Codex completion in this test")


@pytest.fixture()
def openai_codex_service():
    return FakeOpenAICodexService()


@pytest.fixture(autouse=True)
def fake_openai_codex_service(monkeypatch, openai_codex_service):
    monkeypatch.setattr(
        "app.routes.ai.get_openai_codex_service", lambda _settings: openai_codex_service
    )
    monkeypatch.setattr(
        "app.services.ai.get_openai_codex_service", lambda _settings: openai_codex_service
    )


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    database = Path("/tmp/bianco-pytest.db")
    data_directory = Path("/tmp/bianco-pytest-data")
    database.unlink(missing_ok=True)
    shutil.rmtree(data_directory, ignore_errors=True)
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    yield
    engine.dispose()
    for suffix in ("", "-wal", "-shm"):
        Path(f"/tmp/bianco-pytest.db{suffix}").unlink(missing_ok=True)
    shutil.rmtree(data_directory, ignore_errors=True)


@pytest.fixture(autouse=True)
def clean_database(migrated_database):
    with SessionLocal() as session:
        session.execute(delete(AIExtractionJob))
        session.execute(delete(AISettings))
        session.execute(delete(AIProviderConfiguration))
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
