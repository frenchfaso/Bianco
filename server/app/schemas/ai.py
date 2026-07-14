from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    locale: str = Field("it-IT", max_length=20)
    currency: str = Field("EUR", min_length=3, max_length=3)


class InsightSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

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
