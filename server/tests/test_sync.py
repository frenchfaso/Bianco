from app.database import SessionLocal
from app.models import SyncDocument, SyncSequence


def receipt(document_id="r1", updated_at="2026-07-14T10:00:00Z", deleted=False):
    return {
        "id": document_id,
        "status": "manual",
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
