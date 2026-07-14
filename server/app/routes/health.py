import os
import tempfile
from functools import lru_cache
from typing import Annotated

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_session

router = APIRouter(prefix="/api/health", tags=["health"])


@lru_cache
def expected_migration_head() -> str:
    return ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()


@router.get("/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def ready(
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    checks: dict[str, bool] = {"database": False, "dataDirectory": False, "migrations": False}
    try:
        session.execute(text("SELECT 1"))
        checks["database"] = True
        version = session.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        checks["migrations"] = version == expected_migration_head()
    except Exception:
        session.rollback()

    try:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        descriptor, path = tempfile.mkstemp(prefix=".ready-", dir=settings.data_dir)
        os.close(descriptor)
        os.unlink(path)
        checks["dataDirectory"] = True
    except OSError:
        pass

    status_code = 200 if all(checks.values()) else 503
    return JSONResponse(
        status_code=status_code,
        content={"status": "ready" if status_code == 200 else "not-ready", "checks": checks},
    )
