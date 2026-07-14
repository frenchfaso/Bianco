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


class OllamaProvider:
    id = "ollama"
    label = "Ollama"

    def __init__(self, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.model)

    async def health_check(self) -> bool:
        if not self.configured:
            return False
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/api/tags")
            if not response.is_success:
                return False
            names = {entry.get("name") for entry in response.json().get("models", [])}
            return self.model in names or any(
                name and name.split(":")[0] == self.model for name in names
            )
        except httpx.HTTPError:
            return False

    async def _chat(self, prompt: str, output_model, images: list[str] | None = None):
        message = {"role": "user", "content": prompt}
        if images:
            message["images"] = images
        payload = {
            "model": self.model,
            "messages": [message],
            "stream": False,
            "format": schema_for(output_model),
            "options": {"temperature": 0},
        }
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(f"{self.base_url}/api/chat", json=payload)
        response.raise_for_status()
        content = response.json()["message"]["content"]
        return output_model.model_validate(parse_json_content(content))

    async def extract_receipt(
        self, image_bytes: bytes, mime_type: str, context: ExtractionContext
    ) -> ReceiptExtraction:
        del mime_type
        prompt = RECEIPT_PROMPT.format(locale=context.locale, currency=context.currency)
        image = base64.b64encode(image_bytes).decode("ascii")
        return await self._chat(prompt, ReceiptExtraction, [image])

    async def generate_insights(
        self, snapshot: InsightSnapshot
    ) -> GeneratedInsights:
        prompt = f"{INSIGHT_PROMPT}\n\nDati aggregati:\n{snapshot.model_dump_json()}"
        return await self._chat(prompt, GeneratedInsights)
