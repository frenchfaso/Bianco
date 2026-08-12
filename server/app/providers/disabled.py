from app.schemas.ai import (
    ExtractionContext,
    GeneratedInsights,
    InsightSnapshot,
    ReceiptExtraction,
)


class DisabledProvider:
    id = "none"
    label = "Disattivato"
    receipt_model = ""
    insight_model = ""
    model = ""

    async def health_check(self) -> bool:
        return False

    async def extract_receipt(
        self, image_bytes: bytes, mime_type: str, context: ExtractionContext
    ) -> ReceiptExtraction:
        raise RuntimeError("AI provider is disabled")

    async def generate_insights(
        self, snapshot: InsightSnapshot
    ) -> GeneratedInsights:
        raise RuntimeError("AI provider is disabled")
