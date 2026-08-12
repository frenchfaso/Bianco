import math
from datetime import date
from ipaddress import ip_address
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.schemas.receipt_fields import CategoryId, CurrencyCode, ReceiptDate

SupportedLocale = Literal["en-GB", "it-IT", "de-DE", "es-ES", "fr-FR"]
MAX_JS_SAFE_INTEGER = 9_007_199_254_740_991

NonNegativeSafeInteger = Annotated[
    int,
    Field(strict=True, ge=0, le=MAX_JS_SAFE_INTEGER),
]
SignedSafeInteger = Annotated[
    int,
    Field(
        strict=True,
        ge=-MAX_JS_SAFE_INTEGER,
        le=MAX_JS_SAFE_INTEGER,
    ),
]


def _strict_finite_number(value):
    if type(value) not in {int, float} or not math.isfinite(value):
        raise ValueError("must be a finite JSON number")
    return value


NonNegativeSafeNumber = Annotated[
    int | float,
    BeforeValidator(_strict_finite_number),
    Field(ge=0, le=MAX_JS_SAFE_INTEGER),
]
# Receipt items are replicated into the client schema, whose quantity ceiling
# is intentionally much lower than the generic analytics number ceiling.
ReceiptQuantity = Annotated[
    int | float,
    BeforeValidator(_strict_finite_number),
    Field(ge=0, le=1_000_000),
]
WarningText = Annotated[str, Field(max_length=300)]
SignedSafeNumber = Annotated[
    int | float,
    BeforeValidator(_strict_finite_number),
    Field(ge=-MAX_JS_SAFE_INTEGER, le=MAX_JS_SAFE_INTEGER),
]


class AiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True, extra="forbid")


class Merchant(AiModel):
    raw_name: str | None = Field(None, alias="rawName", max_length=300)
    normalized_name: str | None = Field(None, alias="normalizedName", max_length=300)


class ExtractedItem(AiModel):
    raw_name: str = Field("", alias="rawName", max_length=300)
    normalized_name: str = Field("", alias="normalizedName", max_length=300)
    quantity: ReceiptQuantity | None = None
    unit_price_minor: NonNegativeSafeInteger | None = Field(
        None, alias="unitPriceMinor"
    )
    total_price_minor: NonNegativeSafeInteger | None = Field(
        None, alias="totalPriceMinor"
    )
    category_id: CategoryId = Field("other", alias="categoryId")
    confidence: float | None = Field(None, ge=0, le=1, allow_inf_nan=False)


class ReceiptExtraction(AiModel):
    schema_version: Literal[1] = Field(1, alias="schemaVersion")
    document_type: Literal["receipt"] = Field("receipt", alias="documentType")
    merchant: Merchant = Field(default_factory=Merchant)
    transaction_date: ReceiptDate | None = Field(None, alias="transactionDate")
    currency: CurrencyCode = "EUR"
    subtotal_minor: NonNegativeSafeInteger | None = Field(
        None, alias="subtotalMinor"
    )
    tax_minor: NonNegativeSafeInteger | None = Field(None, alias="taxMinor")
    discount_minor: NonNegativeSafeInteger | None = Field(
        None, alias="discountMinor"
    )
    total_minor: NonNegativeSafeInteger | None = Field(None, alias="totalMinor")
    category_id: CategoryId = Field("other", alias="categoryId")
    items: list[ExtractedItem] = Field(default_factory=list, max_length=250)
    confidence: float | None = Field(None, ge=0, le=1, allow_inf_nan=False)
    warnings: list[WarningText] = Field(default_factory=list, max_length=30)

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper() if isinstance(value, str) else value


class ExtractionContext(AiModel):
    locale: SupportedLocale = "en-GB"
    currency: CurrencyCode = "EUR"

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper() if isinstance(value, str) else value


class InsightPeriod(AiModel):
    start: str = Field(
        strict=True,
        min_length=10,
        max_length=10,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    end: str = Field(
        strict=True,
        min_length=10,
        max_length=10,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    previous_start: str = Field(
        alias="previousStart",
        strict=True,
        min_length=10,
        max_length=10,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    previous_end: str = Field(
        alias="previousEnd",
        strict=True,
        min_length=10,
        max_length=10,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )

    @model_validator(mode="after")
    def validate_dates(self):
        values = (
            self.start,
            self.end,
            self.previous_start,
            self.previous_end,
        )
        try:
            parsed = tuple(date.fromisoformat(value) for value in values)
        except ValueError as error:
            raise ValueError("period dates must be valid ISO calendar dates") from error
        if parsed[0] > parsed[1] or parsed[2] > parsed[3]:
            raise ValueError("period date ranges must be ordered")
        return self


class InsightComparisonEntry(AiModel):
    id: str = Field(strict=True, min_length=1, max_length=300)
    total: NonNegativeSafeInteger
    count: NonNegativeSafeInteger
    previous_total: NonNegativeSafeInteger = Field(alias="previousTotal")
    difference: SignedSafeInteger
    change_percent: SignedSafeNumber | None = Field(alias="changePercent")

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("id cannot be blank")
        return value


class InsightCategoryEntry(InsightComparisonEntry):
    id: CategoryId


class InsightMerchantEntry(InsightComparisonEntry):
    pass


class InsightItemEntry(AiModel):
    id: str = Field(strict=True, min_length=1, max_length=300)
    total: NonNegativeSafeInteger
    quantity: NonNegativeSafeNumber
    frequency: NonNegativeSafeInteger

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("id cannot be blank")
        return value


class InsightPriceChangeEntry(AiModel):
    id: str = Field(strict=True, min_length=1, max_length=300)
    latest: NonNegativeSafeInteger
    previous_average: NonNegativeSafeInteger = Field(alias="previousAverage")
    difference: SignedSafeInteger
    change_percent: SignedSafeNumber | None = Field(alias="changePercent")

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("id cannot be blank")
        return value


class InsightSnapshot(AiModel):
    locale: SupportedLocale = "en-GB"
    currency: str = Field(
        "EUR",
        strict=True,
        min_length=3,
        max_length=3,
        pattern=r"^[A-Z]{3}$",
    )
    period: InsightPeriod
    total: NonNegativeSafeInteger
    previous_total: NonNegativeSafeInteger = Field(alias="previousTotal")
    categories: list[InsightCategoryEntry] = Field(max_length=100)
    merchants: list[InsightMerchantEntry] = Field(max_length=100)
    items: list[InsightItemEntry] = Field(max_length=100)
    price_changes: list[InsightPriceChangeEntry] = Field(
        alias="priceChanges",
        max_length=100,
    )


class GeneratedInsights(AiModel):
    observations: list[str] = Field(default_factory=list, max_length=3)
    suggestion: str | None = Field(None, max_length=500)


class GroundedInsightReference(AiModel):
    ref: str = Field(
        strict=True,
        min_length=1,
        max_length=32,
        pattern=r"^(?:total|category:\d+|merchant:\d+|item:\d+|price_change:\d+)$",
    )
    emphasis: Literal["current", "change", "frequency"]


class GroundedInsightSelection(AiModel):
    observations: list[GroundedInsightReference] = Field(max_length=3)
    suggestion_observation: int | None = Field(
        alias="suggestionObservation",
        strict=True,
        ge=0,
        le=2,
    )

    @model_validator(mode="after")
    def references_must_be_unique_and_suggestion_in_range(self):
        refs = [observation.ref for observation in self.observations]
        if len(refs) != len(set(refs)):
            raise ValueError("observation references must be unique")
        if (
            self.suggestion_observation is not None
            and self.suggestion_observation >= len(self.observations)
        ):
            raise ValueError("suggestionObservation must reference an observation")
        return self


class ProviderConfigurationUpdate(AiModel):
    base_url: str = Field("", alias="baseUrl", max_length=2048)
    # Accepted for compatibility with older clients, but model selection is
    # backend-only and the value is intentionally ignored.
    model: str | None = Field(None, max_length=255)
    api_key: str | None = Field(None, alias="apiKey", max_length=4096)
    clear_api_key: bool = Field(False, alias="clearApiKey")

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value:
            return ""
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Base URL must be an HTTP(S) URL without credentials, query or fragment")
        hostname = parsed.hostname.lower()
        blocked_hosts = {
            "169.254.169.254",
            "169.254.170.2",
            "100.100.100.200",
            "metadata.google.internal",
        }
        if hostname in blocked_hosts:
            raise ValueError("Base URL cannot target an instance metadata service")
        address = None
        try:
            address = ip_address(hostname)
        except ValueError:
            pass
        if address and (
            address.is_link_local
            or address.is_multicast
            or address.is_unspecified
            or address.is_reserved
        ):
            raise ValueError("Base URL cannot target a link-local or reserved address")
        local_hostname = (
            hostname == "localhost"
            or hostname == "host.containers.internal"
            or hostname.endswith((".local", ".lan"))
        )
        local_address = bool(address and (address.is_private or address.is_loopback))
        if parsed.scheme == "http" and not (local_hostname or local_address):
            raise ValueError("Public provider endpoints must use HTTPS")
        return value

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None
