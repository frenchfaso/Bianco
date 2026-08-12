from app.providers.common import (
    build_insight_prompt,
    build_receipt_prompt,
    parse_json_content,
    schema_for,
)
from app.schemas.ai import (
    ExtractionContext,
    GeneratedInsights,
    GroundedInsightSelection,
    InsightSnapshot,
    ReceiptExtraction,
)
from app.services.grounded_insights import render_grounded_insights
from app.services.openai_codex import OpenAICodexService


class OpenAISubscriptionProvider:
    id = "openai"
    label = "OpenAI · ChatGPT subscription"

    def __init__(
        self,
        model: str,
        service: OpenAICodexService,
        reasoning_effort: str = "medium",
        *,
        insight_model: str = "",
        insight_reasoning_effort: str | None = None,
    ) -> None:
        self.receipt_model = model
        self.insight_model = insight_model or model
        # `model` and `reasoning_effort` remain receipt aliases for existing
        # worker integrations and third-party code.
        self.model = self.receipt_model
        self.service = service
        self.reasoning_effort = reasoning_effort
        self.receipt_reasoning_effort = reasoning_effort
        self.insight_reasoning_effort = insight_reasoning_effort or reasoning_effort

    @property
    def configured(self) -> bool:
        return bool(self.receipt_model and self.insight_model)

    async def list_models(self) -> list[str]:
        return [entry["id"] for entry in await self.service.list_models()]

    async def health_check(self) -> bool:
        if not self.configured:
            return False
        try:
            available = set(await self.list_models())
            return {
                self.receipt_model,
                self.insight_model,
            }.issubset(available)
        except Exception:
            return False

    async def extract_receipt(
        self, image_bytes: bytes, mime_type: str, context: ExtractionContext
    ) -> ReceiptExtraction:
        prompt = build_receipt_prompt(context.locale, context.currency)
        content = await self.service.structured_completion(
            model=self.receipt_model,
            instructions=prompt.instructions,
            user_input=prompt.user_input,
            output_schema=schema_for(ReceiptExtraction),
            image_bytes=image_bytes,
            mime_type=mime_type,
            reasoning_effort=self.receipt_reasoning_effort,
        )
        return ReceiptExtraction.model_validate(parse_json_content(content))

    async def generate_insights(
        self, snapshot: InsightSnapshot
    ) -> GeneratedInsights:
        selection = await self.select_insights(snapshot)
        return render_grounded_insights(snapshot, selection)

    async def select_insights(
        self, snapshot: InsightSnapshot
    ) -> GroundedInsightSelection:
        """Return the production structured selection for offline evaluation."""
        prompt = build_insight_prompt(snapshot)
        content = await self.service.structured_completion(
            model=self.insight_model,
            instructions=prompt.instructions,
            user_input=prompt.user_input,
            output_schema=schema_for(GroundedInsightSelection),
            reasoning_effort=self.insight_reasoning_effort,
        )
        return GroundedInsightSelection.model_validate(
            parse_json_content(content)
        )
