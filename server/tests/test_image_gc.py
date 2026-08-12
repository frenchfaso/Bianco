import json
import os
from pathlib import Path

import pytest

from app.cli.gc_images import garbage_collect_images, referenced_image_hashes
from app.database import SessionLocal
from app.models import SyncDocument, SyncSequence


def store_receipt(receipt_id: str, image_hash: object, *, deleted: bool = False) -> None:
    document = {
        "id": receipt_id,
        "imageHash": image_hash,
        "_deleted": deleted,
    }
    with SessionLocal() as session:
        sequence = SyncSequence(created_at="2026-08-12T00:00:00Z")
        session.add(sequence)
        session.flush()
        session.add(
            SyncDocument(
                owner_id="single-user",
                collection_name="receipts",
                document_id=receipt_id,
                document_json=json.dumps(document),
                server_sequence=sequence.sequence,
                is_deleted=deleted,
                created_at="2026-08-12T00:00:00Z",
                updated_at="2026-08-12T00:00:00Z",
            )
        )
        session.commit()


def image_file(files_dir: Path, image_hash: str, variant: str, payload: bytes) -> Path:
    directory = files_dir / image_hash[:2]
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{image_hash}{variant}"
    path.write_bytes(payload)
    return path


def make_old(path: Path, now: float, days: int = 31) -> None:
    timestamp = now - days * 24 * 60 * 60
    os.utime(path, (timestamp, timestamp))


def test_image_gc_is_dry_run_by_default_and_deletes_only_old_orphans(tmp_path):
    now = 2_000_000_000.0
    referenced_hash = "a" * 64
    orphan_hash = "b" * 64
    recent_hash = "c" * 64
    referenced = image_file(tmp_path, referenced_hash, ".jpg", b"reference")
    orphan_full = image_file(tmp_path, orphan_hash, ".webp", b"orphan-full")
    orphan_thumb = image_file(tmp_path, orphan_hash, ".thumb.webp", b"orphan-thumb")
    recent = image_file(tmp_path, recent_hash, ".jpg", b"recent")
    malformed = tmp_path / orphan_hash[:2] / "notes.txt"
    malformed.write_bytes(b"leave me")
    for path in (referenced, orphan_full, orphan_thumb):
        make_old(path, now)
    os.utime(recent, (now, now))

    dry_run = garbage_collect_images(
        tmp_path,
        {referenced_hash},
        retention_days=30,
        now=now,
    )

    assert dry_run.dry_run is True
    assert dry_run.scanned_files == 4
    assert dry_run.eligible_files == 2
    assert dry_run.eligible_bytes == len(b"orphan-full") + len(b"orphan-thumb")
    assert dry_run.deleted_files == 0
    assert orphan_full.exists() and orphan_thumb.exists()

    deleted = garbage_collect_images(
        tmp_path,
        {referenced_hash},
        retention_days=30,
        delete=True,
        now=now,
    )

    assert deleted.dry_run is False
    assert deleted.deleted_files == 2
    assert deleted.deleted_bytes == len(b"orphan-full") + len(b"orphan-thumb")
    assert not orphan_full.exists() and not orphan_thumb.exists()
    assert referenced.exists() and recent.exists() and malformed.exists()


def test_image_gc_never_follows_file_or_directory_symlinks(tmp_path):
    if not hasattr(os, "symlink"):
        pytest.skip("symlinks unavailable")
    now = 2_000_000_000.0
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    outside_file = outside / f"{'d' * 64}.jpg"
    outside_file.write_bytes(b"private")

    symlink_hash = "e" * 64
    symlink_directory = tmp_path / symlink_hash[:2]
    symlink_directory.mkdir()
    (symlink_directory / f"{symlink_hash}.jpg").symlink_to(outside_file)
    (tmp_path / "dd").symlink_to(outside, target_is_directory=True)

    result = garbage_collect_images(
        tmp_path,
        set(),
        retention_days=0,
        delete=True,
        now=now,
    )

    assert result.deleted_files == 0
    assert result.skipped_symlinks == 2
    assert outside_file.read_bytes() == b"private"


def test_referenced_image_hashes_only_reads_live_receipts():
    live_hash = "a" * 64
    deleted_hash = "b" * 64
    store_receipt("live", live_hash)
    store_receipt("deleted", deleted_hash, deleted=True)
    store_receipt("without-image", None)

    with SessionLocal() as session:
        assert referenced_image_hashes(session) == {live_hash}


def test_referenced_image_hashes_fails_safe_on_invalid_live_hash():
    store_receipt("invalid", "not-a-hash")
    with SessionLocal() as session:
        with pytest.raises(RuntimeError, match="invalid image hash"):
            referenced_image_hashes(session)


def test_image_gc_refuses_a_symlink_as_files_root(tmp_path):
    actual = tmp_path / "actual"
    actual.mkdir()
    linked = tmp_path / "linked"
    linked.symlink_to(actual, target_is_directory=True)

    with pytest.raises(RuntimeError, match="not a symlink"):
        garbage_collect_images(linked, set())
