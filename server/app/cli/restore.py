import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

from app.cli.backup import (
    BACKUP_FORMAT,
    BACKUP_VERSION,
    DATABASE_ARCHIVE_PATH,
    FILES_ARCHIVE_PATH,
    MANIFEST_ARCHIVE_PATH,
    database_path,
)
from app.config import get_settings

SQLITE_HEADER = b"SQLite format 3\x00"
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 100_000
MAX_DATABASE_BYTES = 50 * 1024 * 1024 * 1024
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _check_database(path: Path) -> None:
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as connection:
        if connection.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise RuntimeError("Source backup failed integrity_check")


def _install_database(source: Path) -> None:
    destination = database_path()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".restore.tmp")
    shutil.copyfile(source, temporary)
    os.replace(temporary, destination)
    for suffix in ("-wal", "-shm"):
        Path(f"{destination}{suffix}").unlink(missing_ok=True)


def _safe_archive_path(value: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise RuntimeError("Backup contains an unsafe path")
    return path


def _copy_member(archive: tarfile.TarFile, member: tarfile.TarInfo, destination: Path) -> None:
    if not member.isfile():
        raise RuntimeError(f"Backup member is not a regular file: {member.name}")
    source = archive.extractfile(member)
    if source is None:
        raise RuntimeError(f"Cannot read backup member: {member.name}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with source, destination.open("wb") as output:
        shutil.copyfileobj(source, output, length=1024 * 1024)


def _validated_manifest(archive: tarfile.TarFile) -> tuple[dict, dict[str, tarfile.TarInfo]]:
    members = archive.getmembers()
    if len(members) > MAX_ARCHIVE_MEMBERS:
        raise RuntimeError("Backup contains too many files")
    by_name: dict[str, tarfile.TarInfo] = {}
    for member in members:
        path = _safe_archive_path(member.name)
        normalized = path.as_posix()
        if normalized in by_name:
            raise RuntimeError(f"Backup contains duplicate member: {normalized}")
        if not member.isfile():
            raise RuntimeError(f"Backup contains unsupported member: {normalized}")
        by_name[normalized] = member

    manifest_member = by_name.get(MANIFEST_ARCHIVE_PATH)
    if manifest_member is None or manifest_member.size > MAX_MANIFEST_BYTES:
        raise RuntimeError("Backup manifest is missing or too large")
    manifest_stream = archive.extractfile(manifest_member)
    if manifest_stream is None:
        raise RuntimeError("Backup manifest cannot be read")
    with manifest_stream:
        manifest = json.loads(manifest_stream.read().decode("utf-8"))
    if (
        manifest.get("format") != BACKUP_FORMAT
        or manifest.get("version") != BACKUP_VERSION
    ):
        raise RuntimeError("Unsupported Bianco backup format")
    return manifest, by_name


def _verify_entry(path: Path, metadata: dict, expected_path: str) -> None:
    if metadata.get("path") != expected_path:
        raise RuntimeError(f"Invalid manifest path: {expected_path}")
    expected_size = metadata.get("size")
    expected_hash = metadata.get("sha256")
    if (
        not isinstance(expected_size, int)
        or expected_size < 0
        or not isinstance(expected_hash, str)
        or not SHA256_PATTERN.fullmatch(expected_hash)
    ):
        raise RuntimeError(f"Invalid manifest metadata: {expected_path}")
    if expected_size != path.stat().st_size or expected_hash != _sha256(path):
        raise RuntimeError(f"Backup checksum mismatch: {expected_path}")


def _restore_archive(source: Path) -> None:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".bianco-restore-", dir=settings.data_dir
    ) as staging_name:
        staging = Path(staging_name)
        database = staging / DATABASE_ARCHIVE_PATH
        staged_files = staging / FILES_ARCHIVE_PATH
        staged_files.mkdir()
        with tarfile.open(source, "r:*") as archive:
            manifest, members = _validated_manifest(archive)
            database_metadata = manifest.get("database")
            file_entries = manifest.get("files")
            if not isinstance(database_metadata, dict) or not isinstance(file_entries, list):
                raise RuntimeError("Backup manifest is invalid")
            database_member = members.get(DATABASE_ARCHIVE_PATH)
            if database_member is None:
                raise RuntimeError("Backup database is missing")
            if database_member.size > MAX_DATABASE_BYTES:
                raise RuntimeError("Backup database is too large")

            expected = {MANIFEST_ARCHIVE_PATH, DATABASE_ARCHIVE_PATH}
            manifest_file_paths: set[str] = set()
            maximum_file_bytes = max(settings.max_upload_bytes * 2, 100 * 1024 * 1024)
            for metadata in file_entries:
                if not isinstance(metadata, dict) or not isinstance(metadata.get("path"), str):
                    raise RuntimeError("Backup file manifest is invalid")
                archive_path = _safe_archive_path(metadata["path"]).as_posix()
                if not archive_path.startswith(f"{FILES_ARCHIVE_PATH}/"):
                    raise RuntimeError("Backup file is outside the files directory")
                if archive_path in manifest_file_paths:
                    raise RuntimeError("Backup manifest contains duplicate files")
                manifest_file_paths.add(archive_path)
                if members.get(archive_path) is None:
                    raise RuntimeError("Backup file listed in manifest is missing")
                if members[archive_path].size > maximum_file_bytes:
                    raise RuntimeError("Backup receipt file is too large")
                expected.add(archive_path)
            if set(members) != expected:
                raise RuntimeError("Backup members do not match the manifest")

            _copy_member(archive, members[DATABASE_ARCHIVE_PATH], database)
            _verify_entry(database, database_metadata, DATABASE_ARCHIVE_PATH)
            for metadata in file_entries:
                archive_path = str(metadata["path"])
                destination = staging / _safe_archive_path(archive_path)
                _copy_member(archive, members[archive_path], destination)
                _verify_entry(destination, metadata, archive_path)
        _check_database(database)

        destination_files = settings.files_dir
        previous_files = Path(
            tempfile.mkdtemp(prefix=".files-before-restore-", dir=settings.data_dir)
        )
        previous_files.rmdir()
        if destination_files.exists():
            os.replace(destination_files, previous_files)
        try:
            os.replace(staged_files, destination_files)
            _install_database(database)
        except Exception:
            shutil.rmtree(destination_files, ignore_errors=True)
            if previous_files.exists():
                os.replace(previous_files, destination_files)
            raise
        shutil.rmtree(previous_files, ignore_errors=True)


def restore(source: Path) -> None:
    source = source.resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    with source.open("rb") as stream:
        header = stream.read(len(SQLITE_HEADER))
    if header == SQLITE_HEADER:
        # Backward compatibility: database-only backups keep existing images.
        _check_database(source)
        _install_database(source)
        return
    if not tarfile.is_tarfile(source):
        raise RuntimeError("Source is neither a Bianco archive nor a SQLite backup")
    _restore_archive(source)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.cli.restore SOURCE")
    restore(Path(sys.argv[1]))
    print(f"Restore completed from: {Path(sys.argv[1]).resolve()}")
