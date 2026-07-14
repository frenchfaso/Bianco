from ipaddress import ip_address
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SupportedLocale = Literal["en-GB", "it-IT", "de-DE", "es-ES", "fr-FR"]


class AiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True, extra="forbid")


class Merchant(AiModel):
    raw_name: str | None = Field(None, alias="rawName", max_length=300)
    normalized_name: str | None = Field(None, alias="normalizedName", max_length=300)


class ExtractedItem(AiModel):
    raw_name: str = Field("", alias="rawName", max_length=300)
    normalized_name: str = Field("", alias="normalizedName", max_length=300)
    quantity: float | None = Field(None, ge=0)
    unit_price_minor: int | None = Field(None, alias="unitPriceMinor", ge=0)
    total_price_minor: int | None = Field(None, alias="totalPriceMinor", ge=0)
    category_id: str = Field("other", alias="categoryId", max_length=80)
    confidence: float | None = Field(None, ge=0, le=1)


class ReceiptExtraction(AiModel):
    schema_version: Literal[1] = Field(1, alias="schemaVersion")
    document_type: Literal["receipt"] = Field("receipt", alias="documentType")
    merchant: Merchant = Field(default_factory=Merchant)
    transaction_date: str | None = Field(None, alias="transactionDate", pattern=r"^\d{4}-\d{2}-\d{2}$")
    currency: str = Field("EUR", min_length=3, max_length=3)
    subtotal_minor: int | None = Field(None, alias="subtotalMinor", ge=0)
    tax_minor: int | None = Field(None, alias="taxMinor", ge=0)
    discount_minor: int | None = Field(None, alias="discountMinor", ge=0)
    total_minor: int | None = Field(None, alias="totalMinor", ge=0)
    category_id: str = Field("other", alias="categoryId", max_length=80)
    items: list[ExtractedItem] = Field(default_factory=list, max_length=250)
    confidence: float | None = Field(None, ge=0, le=1)
    warnings: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def normalize_currency(self):
        self.currency = self.currency.upper()
        return self


class ExtractionContext(AiModel):
    locale: SupportedLocale = "en-GB"
    currency: str = Field("EUR", pattern=r"^[A-Za-z]{3}$")

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()


class InsightSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    locale: SupportedLocale = "en-GB"
    period: dict[str, Any]
    total: int
    previousTotal: int
    categories: list[dict[str, Any]]
    merchants: list[dict[str, Any]]
    items: list[dict[str, Any]]
    priceChanges: list[dict[str, Any]]


class GeneratedInsights(AiModel):
    observations: list[str] = Field(default_factory=list, max_length=3)
    suggestion: str | None = Field(None, max_length=500)


class ProviderConfigurationUpdate(AiModel):
    base_url: str = Field("", alias="baseUrl", max_length=2048)
    model: str = Field("", max_length=255)
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
    def normalize_model(cls, value: str) -> str:
        return value.strip()
