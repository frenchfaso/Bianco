from app.database import SessionLocal
from app.models import SyncDocument, SyncSequence


def receipt(document_id="r1", updated_at="2026-07-14T10:00:00Z", deleted=False):
    return {
        "id": document_id,
        "status": "manual",
        "capturedAt": "2026-07-14T10:00:00Z",
        "transactionDate": "2026-07-14",
        "merchantRaw": None,
        "merchantNormalized": None,
        "currency": "EUR",
        "subtotalMinor": None,
        "taxMinor": None,
        "discountMinor": None,
        "totalMinor": None,
        "categoryId": "other",
        "imageHash": None,
        "overallConfidence": None,
        "warnings": [],
        "userConfirmed": False,
        "ai": {
            "providerId": None,
            "modelId": None,
            "promptVersion": None,
            "schemaVersion": None,
        },
        "updatedAt": updated_at,
        "updatedByDevice": "device-a",
        "_deleted": deleted,
    }


def push(client, headers, rows):
    return client.post("/api/sync/receipts/push", headers=headers, json={"rows": rows})


def test_sync_requires_authentication(client):
    response = client.post("/api/sync/receipts/pull", json={"checkpoint": {"sequence": 0}, "batchSize": 100})
    assert response.status_code == 401


def test_push_pull_sequence_and_server_checkpoint(client, auth_headers):
    first = receipt("r1")
    second = receipt("r2")
    response = push(client, auth_headers, [
        {"assumedMasterState": None, "newDocumentState": first},
        {"assumedMasterState": None, "newDocumentState": second},
    ])
    assert response.status_code == 200
    assert response.json() == {"conflicts": []}

    pulled = client.post(
        "/api/sync/receipts/pull",
        headers=auth_headers,
        json={"checkpoint": {"sequence": 0}, "batchSize": 1},
    ).json()
    assert [document["id"] for document in pulled["documents"]] == ["r1"]
    assert pulled["checkpoint"]["sequence"] == 1

    next_pull = client.post(
        "/api/sync/receipts/pull",
        headers=auth_headers,
        json={"checkpoint": pulled["checkpoint"], "batchSize": 100},
    ).json()
    assert [document["id"] for document in next_pull["documents"]] == ["r2"]
    assert next_pull["checkpoint"]["sequence"] == 2


def test_stale_assumed_state_returns_master_without_writing(client, auth_headers):
    master = receipt()
    assert push(client, auth_headers, [{"assumedMasterState": None, "newDocumentState": master}]).json() == {"conflicts": []}
    stale = {**master, "updatedAt": "2026-07-14T09:00:00Z"}
    proposed = {**master, "updatedAt": "2026-07-14T11:00:00Z"}
    response = push(client, auth_headers, [{"assumedMasterState": stale, "newDocumentState": proposed}])
    assert response.json() == {"conflicts": [master]}
    with SessionLocal() as session:
        assert session.query(SyncSequence).count() == 1


def test_integer_and_float_json_numbers_are_the_same_master_state(client, auth_headers):
    master = {**receipt(), "overallConfidence": 1.0}
    assert push(client, auth_headers, [{
        "assumedMasterState": None,
        "newDocumentState": master,
    }]).json() == {"conflicts": []}

    assumed = {**master, "overallConfidence": 1}
    proposed = {
        **assumed,
        "updatedAt": "2026-07-14T11:00:00Z",
        "userConfirmed": True,
    }
    response = push(client, auth_headers, [{
        "assumedMasterState": assumed,
        "newDocumentState": proposed,
    }])

    assert response.json() == {"conflicts": []}
    pulled = client.post(
        "/api/sync/receipts/pull",
        headers=auth_headers,
        json={"checkpoint": {"sequence": 1}, "batchSize": 100},
    ).json()
    assert pulled["documents"] == [proposed]
    with SessionLocal() as session:
        assert session.query(SyncSequence).count() == 2


def test_tombstone_is_persisted_and_pulled(client, auth_headers):
    master = receipt()
    push(client, auth_headers, [{"assumedMasterState": None, "newDocumentState": master}])
    tombstone = receipt(deleted=True, updated_at="2026-07-14T12:00:00Z")
    response = push(client, auth_headers, [{"assumedMasterState": master, "newDocumentState": tombstone}])
    assert response.json() == {"conflicts": []}
    pulled = client.post(
        "/api/sync/receipts/pull", headers=auth_headers,
        json={"checkpoint": {"sequence": 1}, "batchSize": 100}
    ).json()
    assert pulled["documents"] == [tombstone]
    with SessionLocal() as session:
        assert session.query(SyncDocument).one().is_deleted is True


def test_unknown_collection_is_rejected(client, auth_headers):
    response = client.post(
        "/api/sync/settings/pull", headers=auth_headers,
        json={"checkpoint": {"sequence": 0}, "batchSize": 100}
    )
    assert response.status_code == 404


def test_sync_rejects_unknown_fields_invalid_values_and_large_batches(
    client, auth_headers
):
    unknown = {**receipt(), "unexpected": "value"}
    assert push(
        client,
        auth_headers,
        [{"assumedMasterState": None, "newDocumentState": unknown}],
    ).status_code == 422

    invalid_amount = {**receipt(), "totalMinor": -1}
    assert push(
        client,
        auth_headers,
        [{"assumedMasterState": None, "newDocumentState": invalid_amount}],
    ).status_code == 422

    rows = [
        {
            "assumedMasterState": None,
            "newDocumentState": receipt(f"r-{index}"),
        }
        for index in range(101)
    ]
    assert push(client, auth_headers, rows).status_code == 422


def test_receipt_item_sync_schema_is_enforced(client, auth_headers):
    item = {
        "id": "item-1",
        "receiptId": "receipt-1",
        "rawName": "PANE",
        "normalizedName": "Pane",
        "quantity": 1,
        "unitPriceMinor": 250,
        "totalPriceMinor": 250,
        "categoryId": "food_grocery",
        "confidence": 0.95,
        "position": 0,
        "userEdited": False,
        "updatedAt": "2026-07-14T10:00:00Z",
        "updatedByDevice": "device-a",
        "_deleted": False,
    }
    response = client.post(
        "/api/sync/receipt_items/push",
        headers=auth_headers,
        json={"rows": [{"assumedMasterState": None, "newDocumentState": item}]},
    )
    assert response.status_code == 200

    malformed = {**item, "id": "item-2", "quantity": "1"}
    response = client.post(
        "/api/sync/receipt_items/push",
        headers=auth_headers,
        json={"rows": [{"assumedMasterState": None, "newDocumentState": malformed}]},
    )
    assert response.status_code == 422
