import hashlib
import io
import os
import re
import tempfile
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
IMAGE_FORMATS = {
    "image/jpeg": ("JPEG", ".jpg"),
    "image/webp": ("WEBP", ".webp"),
}
ALLOWED_MIME_TYPES = set(IMAGE_FORMATS)
THUMBNAIL_LONG_EDGE = 1280
THUMBNAIL_QUALITY = 92
DEFAULT_MAX_IMAGE_PIXELS = 64_000_000
DEFAULT_MAX_IMAGE_DIMENSION = 16_384


class InvalidImage(ValueError):
    pass


def validate_image(
    payload: bytes,
    claimed_hash: str,
    mime_type: str,
    *,
    max_pixels: int = DEFAULT_MAX_IMAGE_PIXELS,
    max_dimension: int = DEFAULT_MAX_IMAGE_DIMENSION,
) -> str:
    validate_image_content(
        payload,
        mime_type,
        max_pixels=max_pixels,
        max_dimension=max_dimension,
    )
    calculated = hashlib.sha256(payload).hexdigest()
    if not SHA256_PATTERN.fullmatch(claimed_hash) or calculated != claimed_hash:
        raise InvalidImage("SHA-256 does not match the uploaded file")
    return calculated


def _validate_dimensions(
    size: tuple[int, int], *, max_pixels: int, max_dimension: int
) -> None:
    width, height = size
    if width <= 0 or height <= 0:
        raise InvalidImage("The uploaded image has invalid dimensions")
    if width > max_dimension or height > max_dimension:
        raise InvalidImage("The uploaded image dimensions are too large")
    if width * height > max_pixels:
        raise InvalidImage("The uploaded image contains too many pixels")


def validate_image_content(
    payload: bytes,
    mime_type: str,
    *,
    max_pixels: int = DEFAULT_MAX_IMAGE_PIXELS,
    max_dimension: int = DEFAULT_MAX_IMAGE_DIMENSION,
) -> None:
    if mime_type not in ALLOWED_MIME_TYPES:
        raise InvalidImage("Only image/jpeg and image/webp uploads are accepted")
    try:
        with Image.open(io.BytesIO(payload)) as image:
            if image.format != IMAGE_FORMATS[mime_type][0]:
                raise InvalidImage("The declared MIME type does not match the image")
            _validate_dimensions(
                image.size,
                max_pixels=max_pixels,
                max_dimension=max_dimension,
            )
            image.verify()
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as error:
        raise InvalidImage("The uploaded file is not a valid image") from error


def file_path(
    files_dir: Path,
    file_id: str,
    thumbnail: bool = False,
    mime_type: str | None = None,
) -> Path:
    if not SHA256_PATTERN.fullmatch(file_id):
        raise InvalidImage("Invalid file id")
    directory = files_dir / file_id[:2]
    if mime_type is not None:
        if mime_type not in ALLOWED_MIME_TYPES:
            raise InvalidImage("Unsupported image MIME type")
        suffix = IMAGE_FORMATS[mime_type][1]
        variant = f".thumb{suffix}" if thumbnail else suffix
        return directory / f"{file_id}{variant}"
    for candidate_mime in IMAGE_FORMATS:
        candidate = file_path(
            files_dir,
            file_id,
            thumbnail=thumbnail,
            mime_type=candidate_mime,
        )
        if candidate.is_file():
            return candidate
    return file_path(
        files_dir,
        file_id,
        thumbnail=thumbnail,
        mime_type="image/jpeg",
    )


def mime_type_for_path(path: Path) -> str:
    return "image/webp" if path.suffix.lower() == ".webp" else "image/jpeg"


def store_image(
    files_dir: Path,
    file_id: str,
    payload: bytes,
    mime_type: str = "image/jpeg",
    *,
    max_pixels: int = DEFAULT_MAX_IMAGE_PIXELS,
    max_dimension: int = DEFAULT_MAX_IMAGE_DIMENSION,
) -> bool:
    destination = file_path(files_dir, file_id, mime_type=mime_type)
    destination.parent.mkdir(parents=True, exist_ok=True)
    existed = destination.exists()
    if not existed:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(payload)
                output.flush()
                os.fsync(output.fileno())
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)

    ensure_thumbnail(
        files_dir,
        file_id,
        mime_type=mime_type,
        max_pixels=max_pixels,
        max_dimension=max_dimension,
    )
    return existed


def validate_and_store_image(
    files_dir: Path,
    payload: bytes,
    claimed_hash: str,
    mime_type: str,
    *,
    max_pixels: int = DEFAULT_MAX_IMAGE_PIXELS,
    max_dimension: int = DEFAULT_MAX_IMAGE_DIMENSION,
) -> tuple[str, bool]:
    """CPU-bound Pillow work is kept together for execution in a worker thread."""
    file_id = validate_image(
        payload,
        claimed_hash,
        mime_type,
        max_pixels=max_pixels,
        max_dimension=max_dimension,
    )
    return file_id, store_image(
        files_dir,
        file_id,
        payload,
        mime_type,
        max_pixels=max_pixels,
        max_dimension=max_dimension,
    )


def ensure_thumbnail(
    files_dir: Path,
    file_id: str,
    *,
    mime_type: str | None = None,
    max_pixels: int = DEFAULT_MAX_IMAGE_PIXELS,
    max_dimension: int = DEFAULT_MAX_IMAGE_DIMENSION,
) -> Path:
    source = file_path(files_dir, file_id, mime_type=mime_type) if mime_type else file_path(files_dir, file_id)
    if not source.is_file():
        raise FileNotFoundError(source)
    resolved_mime_type = mime_type or mime_type_for_path(source)
    thumbnail = file_path(
        files_dir,
        file_id,
        thumbnail=True,
        mime_type=resolved_mime_type,
    )
    with Image.open(source) as original:
        _validate_dimensions(
            original.size,
            max_pixels=max_pixels,
            max_dimension=max_dimension,
        )
        expected_edge = min(THUMBNAIL_LONG_EDGE, max(original.size))
        if thumbnail.exists():
            try:
                with Image.open(thumbnail) as current:
                    if max(current.size) >= expected_edge:
                        return thumbnail
            except (UnidentifiedImageError, OSError):
                pass
        image = ImageOps.exif_transpose(original).convert("RGB")
        image.thumbnail(
            (THUMBNAIL_LONG_EDGE, THUMBNAIL_LONG_EDGE),
            Image.Resampling.LANCZOS,
        )
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{thumbnail.name}.", suffix=".tmp", dir=thumbnail.parent
        )
        os.close(descriptor)
        temporary = Path(temporary_name)
        try:
            if resolved_mime_type == "image/webp":
                image.save(temporary, format="WEBP", quality=THUMBNAIL_QUALITY, method=4)
            else:
                image.save(temporary, format="JPEG", quality=THUMBNAIL_QUALITY, optimize=True)
            temporary.replace(thumbnail)
        finally:
            temporary.unlink(missing_ok=True)
    return thumbnail
