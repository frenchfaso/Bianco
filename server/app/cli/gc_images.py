import argparse
import json
import os
import re
import stat
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import SyncDocument
from app.repositories.sync import OWNER_ID
from app.services.files import SHA256_PATTERN

DEFAULT_RETENTION_DAYS = 30
SECONDS_PER_DAY = 24 * 60 * 60
IMAGE_FILE_PATTERN = re.compile(
    r"^(?P<hash>[a-f0-9]{64})(?:\.thumb)?\.(?:jpg|webp)$"
)
HEX_PREFIX_PATTERN = re.compile(r"^[a-f0-9]{2}$")


@dataclass(frozen=True)
class ImageFile:
    directory: str
    name: str
    image_hash: str
    size: int
    mtime: float
    device: int
    inode: int

    @property
    def relative_path(self) -> str:
        return f"{self.directory}/{self.name}"


@dataclass(frozen=True)
class ImageGcResult:
    dry_run: bool
    referenced_hashes: int
    scanned_files: int
    eligible_files: int
    eligible_bytes: int
    deleted_files: int
    deleted_bytes: int
    skipped_symlinks: int


def referenced_image_hashes(session: Session) -> set[str]:
    """Return all image hashes reachable from a live receipt."""

    rows = session.scalars(
        select(SyncDocument).where(
            SyncDocument.owner_id == OWNER_ID,
            SyncDocument.collection_name == "receipts",
            SyncDocument.is_deleted.is_(False),
        )
    ).all()
    referenced: set[str] = set()
    for row in rows:
        try:
            document = json.loads(row.document_json)
        except (TypeError, json.JSONDecodeError) as error:
            raise RuntimeError(
                f"Cannot safely inspect receipt {row.document_id}"
            ) from error
        image_hash = document.get("imageHash")
        if image_hash is None:
            continue
        if not isinstance(image_hash, str) or not SHA256_PATTERN.fullmatch(image_hash):
            raise RuntimeError(
                f"Receipt {row.document_id} contains an invalid image hash"
            )
        referenced.add(image_hash)
    return referenced


def _directory_flags() -> int:
    return os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)


def _scan_files(files_dir: Path) -> tuple[list[ImageFile], int]:
    if not files_dir.exists():
        return [], 0
    root_stat = files_dir.lstat()
    if stat.S_ISLNK(root_stat.st_mode) or not stat.S_ISDIR(root_stat.st_mode):
        raise RuntimeError("Receipt files directory must be a real directory, not a symlink")

    images: list[ImageFile] = []
    skipped_symlinks = 0
    root_fd = os.open(files_dir, _directory_flags())
    try:
        with os.scandir(root_fd) as directories:
            for directory in directories:
                if directory.is_symlink():
                    skipped_symlinks += 1
                    continue
                if (
                    not HEX_PREFIX_PATTERN.fullmatch(directory.name)
                    or not directory.is_dir(follow_symlinks=False)
                ):
                    continue
                directory_fd = os.open(
                    directory.name,
                    _directory_flags(),
                    dir_fd=root_fd,
                )
                try:
                    with os.scandir(directory_fd) as entries:
                        for entry in entries:
                            if entry.is_symlink():
                                skipped_symlinks += 1
                                continue
                            if not entry.is_file(follow_symlinks=False):
                                continue
                            match = IMAGE_FILE_PATTERN.fullmatch(entry.name)
                            if match is None:
                                continue
                            image_hash = match.group("hash")
                            if image_hash[:2] != directory.name:
                                continue
                            metadata = entry.stat(follow_symlinks=False)
                            images.append(
                                ImageFile(
                                    directory=directory.name,
                                    name=entry.name,
                                    image_hash=image_hash,
                                    size=metadata.st_size,
                                    mtime=metadata.st_mtime,
                                    device=metadata.st_dev,
                                    inode=metadata.st_ino,
                                )
                            )
                finally:
                    os.close(directory_fd)
    finally:
        os.close(root_fd)
    return images, skipped_symlinks


def _delete_scanned_file(files_dir: Path, image: ImageFile) -> bool:
    """Delete only the exact regular file scanned below the trusted root fd."""

    root_fd = os.open(files_dir, _directory_flags())
    try:
        directory_fd = os.open(
            image.directory,
            _directory_flags(),
            dir_fd=root_fd,
        )
        try:
            current = os.stat(image.name, dir_fd=directory_fd, follow_symlinks=False)
            if (
                not stat.S_ISREG(current.st_mode)
                or current.st_dev != image.device
                or current.st_ino != image.inode
            ):
                return False
            os.unlink(image.name, dir_fd=directory_fd)
            return True
        except FileNotFoundError:
            return False
        finally:
            os.close(directory_fd)
    finally:
        os.close(root_fd)


def garbage_collect_images(
    files_dir: Path,
    referenced: set[str],
    *,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    delete: bool = False,
    now: float | None = None,
) -> ImageGcResult:
    if retention_days < 0:
        raise ValueError("Retention days cannot be negative")
    cutoff = (time.time() if now is None else now) - retention_days * SECONDS_PER_DAY
    files, skipped_symlinks = _scan_files(files_dir)
    eligible = [
        image
        for image in files
        if image.image_hash not in referenced and image.mtime <= cutoff
    ]
    deleted_files = 0
    deleted_bytes = 0
    if delete:
        for image in eligible:
            if _delete_scanned_file(files_dir, image):
                deleted_files += 1
                deleted_bytes += image.size

    return ImageGcResult(
        dry_run=not delete,
        referenced_hashes=len(referenced),
        scanned_files=len(files),
        eligible_files=len(eligible),
        eligible_bytes=sum(image.size for image in eligible),
        deleted_files=deleted_files,
        deleted_bytes=deleted_bytes,
        skipped_symlinks=skipped_symlinks,
    )


def _non_negative_integer(value: str) -> int:
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return number


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Find unreferenced receipt images; dry-run unless --delete is used."
    )
    parser.add_argument(
        "--retention-days",
        type=_non_negative_integer,
        default=DEFAULT_RETENTION_DAYS,
        help=f"minimum orphan age (default: {DEFAULT_RETENTION_DAYS} days)",
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="permanently delete eligible files",
    )
    arguments = parser.parse_args()

    with SessionLocal() as session:
        referenced = referenced_image_hashes(session)
    result = garbage_collect_images(
        get_settings().files_dir,
        referenced,
        retention_days=arguments.retention_days,
        delete=arguments.delete,
    )
    print(json.dumps(asdict(result), sort_keys=True))


if __name__ == "__main__":
    main()
