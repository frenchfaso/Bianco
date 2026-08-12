import json
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    TypeAdapter,
    field_validator,
    model_validator,
)

MAX_SYNC_ROWS = 100
MAX_SYNC_DOCUMENT_BYTES = 128 * 1024
MAX_SAFE_INTEGER = 9_007_199_254_740_991
MAX_RECEIPT_AGGREGATE_ITEMS = 500

DocumentId = Annotated[
    str,
    StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"),
]
ShortText = Annotated[str, StringConstraints(max_length=300)]
CategoryId = Annotated[
    str,
    StringConstraints(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$"),
]
CurrencyCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
Timestamp = Annotated[str, StringConstraints(min_length=20, max_length=40)]
NullableAmount = int | None


class ApiModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
        strict=True,
    )


def _validate_timestamp(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("must be an ISO 8601 timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError("must include a timezone")
    return value


class SyncDocumentBase(ApiModel):
    id: DocumentId
    updated_at: Timestamp = Field(alias="updatedAt")
    updated_by_device: Annotated[str, StringConstraints(min_length=1, max_length=128)] = (
        Field(alias="updatedByDevice")
    )
    deleted: bool = Field(False, alias="_deleted")

    _timestamp = field_validator("updated_at")(_validate_timestamp)


class ReceiptAiMetadata(ApiModel):
    provider_id: Annotated[str, StringConstraints(max_length=64)] | None = Field(
        alias="providerId"
    )
    model_id: Annotated[str, StringConstraints(max_length=255)] | None = Field(
        alias="modelId"
    )
    prompt_version: Annotated[str, StringConstraints(max_length=128)] | None = Field(
        alias="promptVersion"
    )
    schema_version: Annotated[int, Field(ge=0, le=1000)] | None = Field(
        alias="schemaVersion"
    )


class ReceiptSyncDocument(SyncDocumentBase):
    status: Literal[
        "captured",
        "queued",
        "processing",
        "needs_review",
        "confirmed",
        "failed",
        "manual",
    ]
    captured_at: Timestamp = Field(alias="capturedAt")
    transaction_date: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")] | None = Field(
        alias="transactionDate"
    )
    merchant_raw: ShortText | None = Field(alias="merchantRaw")
    merchant_normalized: ShortText | None = Field(alias="merchantNormalized")
    currency: CurrencyCode
    subtotal_minor: NullableAmount = Field(alias="subtotalMinor", ge=0, le=MAX_SAFE_INTEGER)
    tax_minor: NullableAmount = Field(alias="taxMinor", ge=0, le=MAX_SAFE_INTEGER)
    discount_minor: NullableAmount = Field(alias="discountMinor", ge=0, le=MAX_SAFE_INTEGER)
    total_minor: NullableAmount = Field(alias="totalMinor", ge=0, le=MAX_SAFE_INTEGER)
    category_id: CategoryId = Field(alias="categoryId")
    image_hash: Annotated[
        str,
        StringConstraints(pattern=r"^[a-f0-9]{64}$"),
    ] | None = Field(alias="imageHash")
    overall_confidence: float | None = Field(
        alias="overallConfidence", ge=0, le=1, allow_inf_nan=False
    )
    warnings: list[Annotated[str, StringConstraints(max_length=300)]] = Field(
        max_length=30
    )
    user_confirmed: bool = Field(alias="userConfirmed")
    ai: ReceiptAiMetadata

    _captured_timestamp = field_validator("captured_at")(_validate_timestamp)

    @field_validator("transaction_date")
    @classmethod
    def validate_transaction_date(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as error:
                raise ValueError("must be a real ISO 8601 calendar date") from error
        return value


class ReceiptItemSyncDocument(SyncDocumentBase):
    receipt_id: DocumentId = Field(alias="receiptId")
    raw_name: ShortText = Field(alias="rawName")
    normalized_name: ShortText = Field(alias="normalizedName")
    quantity: float | None = Field(None, ge=0, le=1_000_000, allow_inf_nan=False)
    unit_price_minor: NullableAmount = Field(
        alias="unitPriceMinor", ge=0, le=MAX_SAFE_INTEGER
    )
    total_price_minor: NullableAmount = Field(
        alias="totalPriceMinor", ge=0, le=MAX_SAFE_INTEGER
    )
    category_id: CategoryId = Field(alias="categoryId")
    confidence: float | None = Field(None, ge=0, le=1, allow_inf_nan=False)
    position: int = Field(ge=0, le=100_000)
    user_edited: bool = Field(alias="userEdited")


SYNC_DOCUMENT_ADAPTERS = {
    "receipts": TypeAdapter(ReceiptSyncDocument),
    "receipt_items": TypeAdapter(ReceiptItemSyncDocument),
}


def validate_sync_document(collection: str, document: dict[str, Any]) -> None:
    """Validate replicated input without normalizing the conflict payload."""
    try:
        encoded = json.dumps(
            document,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise ValueError("Replicated document must be valid JSON") from error
    if len(encoded) > MAX_SYNC_DOCUMENT_BYTES:
        raise ValueError("Replicated document is too large")
    adapter = SYNC_DOCUMENT_ADAPTERS.get(collection)
    if adapter is None:
        raise ValueError("Unknown replicated collection")
    adapter.validate_python(document)


class Checkpoint(ApiModel):
    sequence: int = Field(ge=0)


class PullRequest(ApiModel):
    checkpoint: Checkpoint | None = None
    batch_size: int = Field(100, alias="batchSize", ge=1, le=MAX_SYNC_ROWS)


class PullResponse(ApiModel):
    documents: list[dict[str, Any]]
    checkpoint: Checkpoint


class PushRow(ApiModel):
    assumed_master_state: dict[str, Any] | None = Field(
        None, alias="assumedMasterState"
    )
    new_document_state: dict[str, Any] = Field(alias="newDocumentState")


class PushRequest(ApiModel):
    rows: list[PushRow] = Field(max_length=MAX_SYNC_ROWS)


class PushResponse(ApiModel):
    conflicts: list[dict[str, Any]]


class ReceiptAggregateHeader(ApiModel):
    """The receipt fields a person may edit without replacing AI provenance."""

    merchant_normalized: ShortText | None = Field(alias="merchantNormalized")
    transaction_date: Annotated[
        str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")
    ] | None = Field(alias="transactionDate")
    currency: CurrencyCode
    subtotal_minor: NullableAmount = Field(
        alias="subtotalMinor", ge=0, le=MAX_SAFE_INTEGER
    )
    tax_minor: NullableAmount = Field(alias="taxMinor", ge=0, le=MAX_SAFE_INTEGER)
    discount_minor: NullableAmount = Field(
        alias="discountMinor", ge=0, le=MAX_SAFE_INTEGER
    )
    total_minor: NullableAmount = Field(alias="totalMinor", ge=0, le=MAX_SAFE_INTEGER)
    category_id: CategoryId = Field(alias="categoryId")

    @field_validator("transaction_date")
    @classmethod
    def validate_transaction_date(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as error:
                raise ValueError("must be a real ISO 8601 calendar date") from error
        return value


class ReceiptAggregateItemInput(ApiModel):
    id: DocumentId | None = None
    normalized_name: Annotated[
        str, StringConstraints(min_length=1, max_length=300)
    ] = Field(alias="normalizedName")
    quantity: float | None = Field(None, ge=0, le=1_000_000, allow_inf_nan=False)
    unit_price_minor: NullableAmount = Field(
        alias="unitPriceMinor", ge=0, le=MAX_SAFE_INTEGER
    )
    total_price_minor: NullableAmount = Field(
        alias="totalPriceMinor", ge=0, le=MAX_SAFE_INTEGER
    )
    category_id: CategoryId = Field(alias="categoryId")


class ReceiptAggregateUpdate(ApiModel):
    base_revision: int = Field(alias="baseRevision", ge=0)
    updated_by_device: Annotated[
        str,
        StringConstraints(
            min_length=1,
            max_length=128,
            pattern=r"^[A-Za-z0-9._:-]+$",
        ),
    ] = Field(alias="updatedByDevice")
    receipt: ReceiptAggregateHeader
    items: list[ReceiptAggregateItemInput] = Field(
        max_length=MAX_RECEIPT_AGGREGATE_ITEMS
    )

    @model_validator(mode="after")
    def item_ids_must_be_unique(self) -> "ReceiptAggregateUpdate":
        item_ids = [item.id for item in self.items if item.id is not None]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("Receipt item ids must be unique")
        return self


class ReceiptAggregate(ApiModel):
    revision: int = Field(ge=0)
    receipt: ReceiptSyncDocument
    items: list[ReceiptItemSyncDocument]
