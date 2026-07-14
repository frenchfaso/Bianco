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
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        *,
        provider_id: str = "openai-compatible",
        label: str = "Altro / OpenAI-compatible",
        requires_api_key: bool = False,
    ) -> None:
        self.id = provider_id
        self.label = label
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.requires_api_key = requires_api_key

    @property
    def configured(self) -> bool:
        credentials_ready = bool(self.api_key) or not self.requires_api_key
        return bool(self.base_url and self.model and credentials_ready)

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    async def list_models(self) -> list[str]:
        credentials_ready = bool(self.api_key) or not self.requires_api_key
        if not self.base_url or not credentials_ready:
            return []
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{self.base_url}/models", headers=self._headers()
            )
        response.raise_for_status()
        return sorted(
            entry["id"]
            for entry in response.json().get("data", [])
            if isinstance(entry, dict) and isinstance(entry.get("id"), str)
        )

    async def health_check(self) -> bool:
        if not self.configured:
            return False
        try:
            models = await self.list_models()
            return self.model in models
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
                "content": (
                    f"{INSIGHT_PROMPT.format(locale=snapshot.locale)}\n\n"
                    f"Dati aggregati:\n{snapshot.model_dump_json()}"
                ),
            }
        ]
        return await self._complete(messages, GeneratedInsights)
