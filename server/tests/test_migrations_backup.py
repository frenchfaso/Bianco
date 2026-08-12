import json
import sqlite3
import tarfile
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.cli.backup import backup, database_path
from app.cli.restore import restore
from app.config import get_settings
from app.database import engine


def test_migrations_are_at_head():
    config = Config("alembic.ini")
    command.check(config)


def test_backup_archive_contains_consistent_database_and_receipt_files(tmp_path):
    settings = get_settings()
    marker = settings.files_dir / "aa" / "backup-marker.jpg"
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_bytes(b"receipt-image")
    destination = tmp_path / "bianco.tar.gz"

    backup(destination)

    assert destination.is_file()
    with tarfile.open(destination, "r:gz") as archive:
        manifest = json.load(archive.extractfile("manifest.json"))
        assert manifest["format"] == "bianco-backup"
        assert manifest["version"] == 1
        assert "database.sqlite3" in archive.getnames()
        assert "files/aa/backup-marker.jpg" in archive.getnames()
        database = tmp_path / "database.sqlite3"
        database.write_bytes(archive.extractfile("database.sqlite3").read())
    with sqlite3.connect(database) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "0005_internal_ai_job_model",
        )
        columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(ai_extraction_jobs)")
        }
        assert columns["model_id"][3] == 0

    marker.write_bytes(b"changed-after-backup")
    engine.dispose()
    restore(destination)
    assert marker.read_bytes() == b"receipt-image"


def test_restore_accepts_legacy_sqlite_backup_without_deleting_files(tmp_path):
    legacy = tmp_path / "legacy.sqlite"
    with sqlite3.connect(database_path()) as source:
        with sqlite3.connect(legacy) as destination:
            source.backup(destination)

    marker = get_settings().files_dir / "legacy-file.jpg"
    marker.write_bytes(b"keep-existing-files")
    engine.dispose()
    restore(legacy)

    assert marker.read_bytes() == b"keep-existing-files"
    with sqlite3.connect(database_path()) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
