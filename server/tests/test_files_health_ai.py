import hashlib
import io

from PIL import Image
from pydantic import ValidationError
import pytest

from app.schemas.ai import ReceiptExtraction


def jpeg_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (640, 480), "white").save(buffer, format="JPEG")
    return buffer.getvalue()


def test_health_live_and_ready(client):
    assert client.get("/api/health/live").json() == {"status": "ok"}
    response = client.get("/api/health/ready")
    assert response.status_code == 200
    assert all(response.json()["checks"].values())


def test_file_upload_is_authenticated_hash_checked_and_idempotent(client, auth_headers):
    payload = jpeg_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    data = {"sha256": digest, "mimeType": "image/jpeg", "receiptId": "r1"}
    files = {"file": ("receipt.jpg", payload, "image/jpeg")}
    assert client.post("/api/files", data=data, files=files).status_code == 401
    first = client.post("/api/files", headers=auth_headers, data=data, files=files)
    assert first.status_code == 200
    assert first.json() == {"fileId": digest, "alreadyExisted": False}
    second = client.post("/api/files", headers=auth_headers, data=data, files=files)
    assert second.json() == {"fileId": digest, "alreadyExisted": True}
    thumbnail = client.get(f"/api/files/{digest}?variant=thumbnail", headers=auth_headers)
    assert thumbnail.status_code == 200
    assert thumbnail.headers["content-type"] == "image/jpeg"
    assert thumbnail.headers["cache-control"] == "private, no-store"


def test_file_upload_rejects_hash_and_mime_mismatch(client, auth_headers):
    payload = jpeg_bytes()
    response = client.post(
        "/api/files", headers=auth_headers,
        data={"sha256": "0" * 64, "mimeType": "image/jpeg", "receiptId": "r1"},
        files={"file": ("receipt.jpg", payload, "image/jpeg")}
    )
    assert response.status_code == 422


def test_ai_schema_rejects_untrusted_provider_values():
    with pytest.raises(ValidationError):
        ReceiptExtraction.model_validate({
            "schemaVersion": 1,
            "documentType": "receipt",
            "merchant": {},
            "currency": "EUR",
            "totalMinor": -100,
            "items": [],
            "confidence": 1.2,
            "warnings": [],
        })


def test_ai_endpoint_is_independent_from_readiness(client, auth_headers):
    provider_response = client.get("/api/ai/providers", headers=auth_headers)
    assert provider_response.status_code == 200
    providers = provider_response.json()["providers"]
    assert {entry["id"] for entry in providers} == {"openai-compatible", "ollama"}
    assert all(entry["configured"] is False for entry in providers)
    assert all(entry["available"] is False for entry in providers)
    assert client.get("/api/health/ready").status_code == 200


def test_ai_endpoint_rejects_fake_jpeg_before_provider_call(client, auth_headers):
    response = client.post(
        "/api/ai/receipts/extract",
        headers=auth_headers,
        data={"currency": "EUR", "locale": "it-IT"},
        files={"image": ("receipt.jpg", b"not-a-jpeg", "image/jpeg")},
    )
    assert response.status_code == 422
