import base64
import json

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

    async def list_models(self) -> list[str]:
        if not self.base_url:
            return []
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{self.base_url}/api/tags")
        response.raise_for_status()
        return sorted(
            entry["name"]
            for entry in response.json().get("models", [])
            if isinstance(entry, dict) and isinstance(entry.get("name"), str)
        )

    async def health_check(self) -> bool:
        if not self.configured:
            return False
        try:
            names = set(await self.list_models())
            return self.model in names or any(
                name and name.split(":")[0] == self.model for name in names
            )
        except httpx.HTTPError:
            return False

    async def _chat(self, prompt: str, output_model, images: list[str] | None = None):
        output_schema = schema_for(output_model)
        grounded_prompt = (
            f"{prompt}\n\nSchema JSON obbligatorio:\n"
            f"{json.dumps(output_schema, ensure_ascii=False, separators=(',', ':'))}"
        )
        message = {"role": "user", "content": grounded_prompt}
        if images:
            message["images"] = images
        payload = {
            "model": self.model,
            "messages": [message],
            "stream": False,
            "think": False,
            "format": output_schema,
            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 2048},
        }
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(f"{self.base_url}/api/chat", json=payload)
            if response.status_code == 400 and "failed to parse grammar" in response.text.lower():
                fallback_payload = {key: value for key, value in payload.items() if key != "format"}
                response = await client.post(f"{self.base_url}/api/chat", json=fallback_payload)
        response.raise_for_status()
        body = response.json()
        content = body["message"]["content"]
        if body.get("done_reason") == "length" or not content.strip():
            raise ValueError("Ollama returned an incomplete structured response")
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
        prompt = (
            f"{INSIGHT_PROMPT.format(locale=snapshot.locale)}\n\n"
            f"Dati aggregati:\n{snapshot.model_dump_json()}"
        )
        return await self._chat(prompt, GeneratedInsights)
