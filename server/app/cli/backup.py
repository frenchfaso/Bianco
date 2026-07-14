import sqlite3
import sys
from pathlib import Path
from urllib.parse import unquote

from app.config import get_settings


def database_path() -> Path:
    url = get_settings().database_url
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        raise RuntimeError("Backup currently supports SQLite database URLs only")
    return Path(unquote(url.removeprefix(prefix))).resolve()


def backup(destination: Path) -> None:
    source = database_path()
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source) as source_connection:
        with sqlite3.connect(destination) as destination_connection:
            source_connection.backup(destination_connection)
            result = destination_connection.execute("PRAGMA integrity_check").fetchone()
            if result != ("ok",):
                raise RuntimeError("Backup integrity check failed")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.cli.backup DESTINATION")
    backup(Path(sys.argv[1]))
    print(f"Backup completed: {Path(sys.argv[1]).resolve()}")
