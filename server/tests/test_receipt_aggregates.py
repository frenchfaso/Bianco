from datetime import datetime
from uuid import UUID

from app.database import SessionLocal
from app.models import SyncDocument, SyncSequence


def receipt(document_id: str, *, image_hash: str | None = None) -> dict:
    return {
        "id": document_id,
        "status": "needs_review",
        "capturedAt": "2026-08-12T08:00:00Z",
        "transactionDate": "2026-08-12",
        "merchantRaw": "RAW MARKET",
        "merchantNormalized": "Raw Market",
        "currency": "EUR",
        "subtotalMinor": 950,
        "taxMinor": 50,
        "discountMinor": 0,
        "totalMinor": 1000,
        "categoryId": "food_grocery",
        "imageHash": image_hash,
        "overallConfidence": 0.91,
        "warnings": ["check total"],
        "userConfirmed": False,
        "ai": {
            "providerId": "openai-codex",
            "modelId": "gpt-5.6-terra",
            "promptVersion": "receipt-v1",
            "schemaVersion": 1,
        },
        "updatedAt": "2026-08-12T08:00:00Z",
        "updatedByDevice": "bianco-ai-worker",
        "_deleted": False,
    }


def item(item_id: str, receipt_id: str, position: int = 0) -> dict:
    return {
        "id": item_id,
        "receiptId": receipt_id,
        "rawName": f"RAW ITEM {position}",
        "normalizedName": f"Item {position}",
        "quantity": 1,
        "unitPriceMinor": 1000,
        "totalPriceMinor": 1000,
        "categoryId": "food_grocery",
        "confidence": 0.87,
        "position": position,
        "userEdited": False,
        "updatedAt": "2026-08-12T08:00:00Z",
        "updatedByDevice": "bianco-ai-worker",
        "_deleted": False,
    }


def push_document(client, headers, collection: str, document: dict) -> None:
    response = client.post(
        f"/api/sync/{collection}/push",
        headers=headers,
        json={"rows": [{"assumedMasterState": None, "newDocumentState": document}]},
    )
    assert response.status_code == 200, response.text


def editable_header(**overrides) -> dict:
    return {
        "merchantNormalized": "Better Market",
        "transactionDate": "2026-08-11",
        "currency": "EUR",
        "subtotalMinor": 1100,
        "taxMinor": 100,
        "discountMinor": 0,
        "totalMinor": 1200,
        "categoryId": "food_grocery",
        **overrides,
    }


def aggregate_update(revision: int, items: list[dict], **overrides) -> dict:
    return {
        "baseRevision": revision,
        "updatedByDevice": "device-a",
        "receipt": editable_header(),
        "items": items,
        **overrides,
    }


def editable_item(item_id: str | None = "item-1", **overrides) -> dict:
    value = {
        "normalizedName": "Organic bread",
        "quantity": 2,
        "unitPriceMinor": 300,
        "totalPriceMinor": 600,
        "categoryId": "food_grocery",
        **overrides,
    }
    if item_id is not None:
        value["id"] = item_id
    return value


def test_receipt_aggregate_update_is_atomic_and_preserves_provenance(
    client, auth_headers, monkeypatch
):
    image_hash = "a" * 64
    push_document(client, auth_headers, "receipts", receipt("receipt-1", image_hash=image_hash))
    push_document(client, auth_headers, "receipt_items", item("item-1", "receipt-1"))

    current = client.get(
        "/api/sync/receipt-aggregates/receipt-1", headers=auth_headers
    ).json()
    assert current["revision"] == 2

    published = 0

    async def count_publish() -> None:
        nonlocal published
        published += 1

    monkeypatch.setattr("app.routes.sync.broadcaster.publish_resync", count_publish)
    response = client.put(
        "/api/sync/receipt-aggregates/receipt-1",
        headers=auth_headers,
        json=aggregate_update(
            current["revision"],
            [editable_item(), editable_item(None, normalizedName="New milk")],
        ),
    )

    assert response.status_code == 200, response.text
    aggregate = response.json()
    assert aggregate["revision"] == 5
    assert aggregate["receipt"]["status"] == "confirmed"
    assert aggregate["receipt"]["userConfirmed"] is True
    assert aggregate["receipt"]["merchantNormalized"] == "Better Market"
    assert aggregate["receipt"]["merchantRaw"] == "RAW MARKET"
    assert aggregate["receipt"]["imageHash"] == image_hash
    assert aggregate["receipt"]["ai"]["modelId"] == "gpt-5.6-terra"
    assert aggregate["receipt"]["overallConfidence"] == 0.91
    assert aggregate["receipt"]["updatedByDevice"] == "device-a"
    assert aggregate["items"][0]["rawName"] == "RAW ITEM 0"
    assert aggregate["items"][0]["confidence"] == 0.87
    assert aggregate["items"][0]["userEdited"] is True
    generated = aggregate["items"][1]
    assert str(UUID(generated["id"])) == generated["id"]
    assert generated["rawName"] == "New milk"
    assert generated["confidence"] is None
    assert published == 1


def test_stale_aggregate_revision_returns_current_state_without_writing(
    client, auth_headers
):
    push_document(client, auth_headers, "receipts", receipt("receipt-1"))
    current = client.get(
        "/api/sync/receipt-aggregates/receipt-1", headers=auth_headers
    ).json()
    with SessionLocal() as session:
        sequence_count = session.query(SyncSequence).count()
        before = session.get(
            SyncDocument, ("single-user", "receipts", "receipt-1")
        ).document_json

    response = client.put(
        "/api/sync/receipt-aggregates/receipt-1",
        headers=auth_headers,
        json=aggregate_update(current["revision"] - 1, []),
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "revision_conflict"
    assert response.json()["detail"]["aggregate"] == current
    with SessionLocal() as session:
        assert session.query(SyncSequence).count() == sequence_count
        assert session.get(
            SyncDocument, ("single-user", "receipts", "receipt-1")
        ).document_json == before


def test_aggregate_update_tombstones_items_omitted_by_the_client(
    client, auth_headers
):
    push_document(client, auth_headers, "receipts", receipt("receipt-1"))
    push_document(client, auth_headers, "receipt_items", item("item-1", "receipt-1", 0))
    push_document(client, auth_headers, "receipt_items", item("item-2", "receipt-1", 1))
    current = client.get(
        "/api/sync/receipt-aggregates/receipt-1", headers=auth_headers
    ).json()

    response = client.put(
        "/api/sync/receipt-aggregates/receipt-1",
        headers=auth_headers,
        json=aggregate_update(current["revision"], [editable_item("item-1")]),
    )

    assert response.status_code == 200, response.text
    assert [entry["id"] for entry in response.json()["items"]] == ["item-1"]
    pulled = client.post(
        "/api/sync/receipt_items/pull",
        headers=auth_headers,
        json={"checkpoint": {"sequence": 0}, "batchSize": 100},
    ).json()["documents"]
    removed = next(entry for entry in pulled if entry["id"] == "item-2")
    assert removed["_deleted"] is True

    # Tombstones remain part of the aggregate revision even though GET hides them.
    with SessionLocal() as session:
        removed_row = session.get(
            SyncDocument, ("single-user", "receipt_items", "item-2")
        )
    assert response.json()["revision"] >= removed_row.server_sequence


def test_aggregate_rejects_invalid_body_and_cross_receipt_item_reference(
    client, auth_headers
):
    push_document(client, auth_headers, "receipts", receipt("receipt-1"))
    push_document(client, auth_headers, "receipts", receipt("receipt-2"))
    push_document(client, auth_headers, "receipt_items", item("foreign-item", "receipt-2"))
    current = client.get(
        "/api/sync/receipt-aggregates/receipt-1", headers=auth_headers
    ).json()

    malformed = aggregate_update(current["revision"], [])
    malformed["receipt"]["unexpected"] = True
    assert client.put(
        "/api/sync/receipt-aggregates/receipt-1",
        headers=auth_headers,
        json=malformed,
    ).status_code == 422

    with SessionLocal() as session:
        sequence_count = session.query(SyncSequence).count()
    cross_reference = client.put(
        "/api/sync/receipt-aggregates/receipt-1",
        headers=auth_headers,
        json=aggregate_update(
            current["revision"], [editable_item("foreign-item")]
        ),
    )
    assert cross_reference.status_code == 422
    assert cross_reference.json()["detail"] == (
        "Receipt item id belongs to another receipt"
    )
    with SessionLocal() as session:
        assert session.query(SyncSequence).count() == sequence_count


def test_receipt_aggregate_requires_authentication_and_existing_receipt(client):
    assert client.get("/api/sync/receipt-aggregates/missing").status_code == 401
    assert client.get(
        "/api/sync/receipt-aggregates/missing",
        headers={"Authorization": "Bearer test-token"},
    ).status_code == 404


def test_aggregate_timestamp_is_newer_than_future_timestamp_already_in_master(
    client, auth_headers
):
    future = "2099-01-01T00:00:00Z"
    future_receipt = receipt("receipt-1")
    future_receipt["updatedAt"] = future
    future_item = item("item-1", "receipt-1")
    future_item["updatedAt"] = "2099-01-02T00:00:00Z"
    push_document(client, auth_headers, "receipts", future_receipt)
    push_document(client, auth_headers, "receipt_items", future_item)
    current = client.get(
        "/api/sync/receipt-aggregates/receipt-1", headers=auth_headers
    ).json()

    response = client.put(
        "/api/sync/receipt-aggregates/receipt-1",
        headers=auth_headers,
        json=aggregate_update(current["revision"], [editable_item("item-1")]),
    )

    assert response.status_code == 200, response.text
    updated = response.json()
    assert datetime.fromisoformat(
        updated["receipt"]["updatedAt"].replace("Z", "+00:00")
    ) > datetime.fromisoformat("2099-01-02T00:00:00+00:00")
    assert updated["items"][0]["updatedAt"] == updated["receipt"]["updatedAt"]
