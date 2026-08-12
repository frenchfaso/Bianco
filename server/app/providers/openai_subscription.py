from app.providers.common import (
    build_insight_prompt,
    build_receipt_prompt,
    parse_json_content,
    schema_for,
)
from app.schemas.ai import (
    ExtractionContext,
    GeneratedInsights,
    InsightSnapshot,
    ReceiptExtraction,
)
from app.services.openai_codex import OpenAICodexService


class OpenAISubscriptionProvider:
    id = "openai"
    label = "OpenAI · ChatGPT subscription"

    def __init__(
        self,
        model: str,
        service: OpenAICodexService,
        reasoning_effort: str = "medium",
    ) -> None:
        self.model = model
        self.service = service
        self.reasoning_effort = reasoning_effort

    @property
    def configured(self) -> bool:
        return bool(self.model)

    async def list_models(self) -> list[str]:
        return [entry["id"] for entry in await self.service.list_models()]

    async def health_check(self) -> bool:
        if not self.configured:
            return False
        try:
            return self.model in await self.list_models()
        except Exception:
            return False

    async def extract_receipt(
        self, image_bytes: bytes, mime_type: str, context: ExtractionContext
    ) -> ReceiptExtraction:
        content = await self.service.structured_completion(
            model=self.model,
            prompt=build_receipt_prompt(context.locale, context.currency),
            output_schema=schema_for(ReceiptExtraction),
            image_bytes=image_bytes,
            mime_type=mime_type,
            reasoning_effort=self.reasoning_effort,
        )
        return ReceiptExtraction.model_validate(parse_json_content(content))

    async def generate_insights(
        self, snapshot: InsightSnapshot
    ) -> GeneratedInsights:
        content = await self.service.structured_completion(
            model=self.model,
            prompt=build_insight_prompt(snapshot),
            output_schema=schema_for(GeneratedInsights),
            reasoning_effort=self.reasoning_effort,
        )
        return GeneratedInsights.model_validate(parse_json_content(content))
