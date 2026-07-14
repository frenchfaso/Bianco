from typing import Protocol

from app.schemas.ai import (
    ExtractionContext,
    GeneratedInsights,
    InsightSnapshot,
    ReceiptExtraction,
)


class AIProvider(Protocol):
    id: str
    label: str
    model: str

    async def health_check(self) -> bool: ...

    async def extract_receipt(
        self, image_bytes: bytes, mime_type: str, context: ExtractionContext
    ) -> ReceiptExtraction: ...

    async def generate_insights(
        self, snapshot: InsightSnapshot
    ) -> GeneratedInsights: ...
