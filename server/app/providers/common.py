import json
import re
from typing import Any

from pydantic import BaseModel

RECEIPT_PROMPT = """Analizza lo scontrino e restituisci esclusivamente JSON conforme allo schema.
Gli importi sono interi nell'unita minima della valuta. Non inventare testo illeggibile.
Normalizza esercente e prodotti in modo prudente; usa categoryId 'other' se incerto.
Locale: {locale}. Valuta predefinita: {currency}."""

INSIGHT_PROMPT = """Genera al massimo tre osservazioni e un suggerimento usando soltanto i dati
aggregati forniti. Non inventare dati, non fare previsioni e non offrire consulenza fiscale o
d'investimento. Restituisci esclusivamente JSON conforme allo schema."""


def schema_for(model: type[BaseModel]) -> dict[str, Any]:
    return model.model_json_schema(mode="serialization")


def parse_json_content(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    value = json.loads(cleaned)
    if not isinstance(value, dict):
        raise ValueError("Provider returned a non-object JSON value")
    return value
