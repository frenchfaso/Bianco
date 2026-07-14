import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.cli.backup import backup


def test_migrations_are_at_head():
    config = Config("alembic.ini")
    command.check(config)


def test_sqlite_backup_is_consistent(tmp_path):
    destination = tmp_path / "bianco.sqlite"
    backup(destination)
    assert destination.is_file()
    with sqlite3.connect(destination) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "0003_backend_ai_queue",
        )
