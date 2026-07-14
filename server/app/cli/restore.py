import os
import shutil
import sqlite3
import sys
from pathlib import Path

from app.cli.backup import database_path


def restore(source: Path) -> None:
    source = source.resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as connection:
        if connection.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise RuntimeError("Source backup failed integrity_check")

    destination = database_path()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".restore.tmp")
    shutil.copyfile(source, temporary)
    os.replace(temporary, destination)
    for suffix in ("-wal", "-shm"):
        sidecar = Path(f"{destination}{suffix}")
        sidecar.unlink(missing_ok=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.cli.restore SOURCE")
    restore(Path(sys.argv[1]))
    print(f"Restore completed from: {Path(sys.argv[1]).resolve()}")
