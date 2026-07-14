import hashlib
import io
import re
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
ALLOWED_MIME_TYPES = {"image/jpeg"}


class InvalidImage(ValueError):
    pass


def validate_image(payload: bytes, claimed_hash: str, mime_type: str) -> str:
    validate_image_content(payload, mime_type)
    calculated = hashlib.sha256(payload).hexdigest()
    if not SHA256_PATTERN.fullmatch(claimed_hash) or calculated != claimed_hash:
        raise InvalidImage("SHA-256 does not match the uploaded file")
    return calculated


def validate_image_content(payload: bytes, mime_type: str) -> None:
    if mime_type not in ALLOWED_MIME_TYPES:
        raise InvalidImage("Only image/jpeg uploads are accepted")
    try:
        with Image.open(io.BytesIO(payload)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError) as error:
        raise InvalidImage("The uploaded file is not a valid image") from error


def file_path(files_dir: Path, file_id: str, thumbnail: bool = False) -> Path:
    if not SHA256_PATTERN.fullmatch(file_id):
        raise InvalidImage("Invalid file id")
    suffix = ".thumb.jpg" if thumbnail else ".jpg"
    return files_dir / file_id[:2] / f"{file_id}{suffix}"


def store_image(files_dir: Path, file_id: str, payload: bytes) -> bool:
    destination = file_path(files_dir, file_id)
    destination.parent.mkdir(parents=True, exist_ok=True)
    existed = destination.exists()
    if not existed:
        temporary = destination.with_suffix(".tmp")
        temporary.write_bytes(payload)
        temporary.replace(destination)

    thumbnail = file_path(files_dir, file_id, thumbnail=True)
    if not thumbnail.exists():
        with Image.open(io.BytesIO(payload)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((320, 320), Image.Resampling.LANCZOS)
            image.save(thumbnail, format="JPEG", quality=78, optimize=True)
    return existed
