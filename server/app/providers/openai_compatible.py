import base64

import httpx

from app.providers.common import (
    INSIGHT_PROMPT,
    RECEIPT_PROMPT,
    parse_json_content,
    schema_for,
)
from app.schemas.ai import (
    ExtractionContext,
    GeneratedInsights,
    InsightSnapshot,
    ReceiptExtraction,
)


class OpenAICompatibleProvider:
    id = "openai-compatible"
    label = "OpenAI-compatible"

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    async def health_check(self) -> bool:
        if not self.configured:
            return False
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/models", headers=self._headers())
            return response.is_success
        except httpx.HTTPError:
            return False

    async def _complete(self, messages: list[dict], output_model):
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": output_model.__name__,
                    "strict": True,
                    "schema": schema_for(output_model),
                },
            },
        }
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return output_model.model_validate(parse_json_content(content))

    async def extract_receipt(
        self, image_bytes: bytes, mime_type: str, context: ExtractionContext
    ) -> ReceiptExtraction:
        image = base64.b64encode(image_bytes).decode("ascii")
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": RECEIPT_PROMPT.format(
                            locale=context.locale, currency=context.currency
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{image}"},
                    },
                ],
            }
        ]
        return await self._complete(messages, ReceiptExtraction)

    async def generate_insights(
        self, snapshot: InsightSnapshot
    ) -> GeneratedInsights:
        messages = [
            {
                "role": "user",
                "content": f"{INSIGHT_PROMPT}\n\nDati aggregati:\n{snapshot.model_dump_json()}",
            }
        ]
        return await self._complete(messages, GeneratedInsights)
