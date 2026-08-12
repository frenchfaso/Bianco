import hashlib
import json
import os
import shutil
import sqlite3
import sys
import tarfile
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote

from app.config import get_settings

BACKUP_FORMAT = "bianco-backup"
BACKUP_VERSION = 1
DATABASE_ARCHIVE_PATH = "database.sqlite3"
FILES_ARCHIVE_PATH = "files"
MANIFEST_ARCHIVE_PATH = "manifest.json"


def database_path() -> Path:
    url = get_settings().database_url
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        raise RuntimeError("Backup currently supports SQLite database URLs only")
    return Path(unquote(url.removeprefix(prefix))).resolve()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sqlite_snapshot(destination: Path) -> None:
    source = database_path()
    with sqlite3.connect(source) as source_connection:
        with sqlite3.connect(destination) as destination_connection:
            source_connection.backup(destination_connection)
            result = destination_connection.execute("PRAGMA integrity_check").fetchone()
            if result != ("ok",):
                raise RuntimeError("Backup integrity check failed")


def _copy_receipt_files(source: Path, destination: Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    if not source.exists():
        return entries
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise RuntimeError(f"Refusing to back up symbolic link: {path}")
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        copied = destination / relative
        copied.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, copied)
        entries.append(
            {
                "path": f"{FILES_ARCHIVE_PATH}/{relative.as_posix()}",
                "size": copied.stat().st_size,
                "sha256": _sha256(copied),
            }
        )
    return entries


def backup(destination: Path) -> None:
    """Create one checksummed archive containing SQLite and all receipt images."""
    settings = get_settings()
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=".bianco-backup-") as temporary_name:
        staging = Path(temporary_name)
        database = staging / DATABASE_ARCHIVE_PATH
        files = staging / FILES_ARCHIVE_PATH
        files.mkdir()
        _sqlite_snapshot(database)
        file_entries = _copy_receipt_files(settings.files_dir, files)
        manifest = {
            "format": BACKUP_FORMAT,
            "version": BACKUP_VERSION,
            "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "database": {
                "path": DATABASE_ARCHIVE_PATH,
                "size": database.stat().st_size,
                "sha256": _sha256(database),
            },
            "files": file_entries,
        }
        manifest_path = staging / MANIFEST_ARCHIVE_PATH
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )

        descriptor, temporary_archive_name = tempfile.mkstemp(
            prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
        )
        os.close(descriptor)
        temporary_archive = Path(temporary_archive_name)
        try:
            with tarfile.open(temporary_archive, "w:gz") as archive:
                archive.add(manifest_path, arcname=MANIFEST_ARCHIVE_PATH)
                archive.add(database, arcname=DATABASE_ARCHIVE_PATH)
                for entry in file_entries:
                    archive.add(staging / str(entry["path"]), arcname=str(entry["path"]))
            os.replace(temporary_archive, destination)
        finally:
            temporary_archive.unlink(missing_ok=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.cli.backup DESTINATION.tar.gz")
    backup(Path(sys.argv[1]))
    print(f"Backup completed: {Path(sys.argv[1]).resolve()}")
