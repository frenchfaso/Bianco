import json
from copy import deepcopy

from app.providers.common import (
    RECEIPT_AUDIT_PROTOCOL,
    build_insight_prompt,
    build_receipt_prompt,
    schema_for,
    strict_json_schema,
)
from app.schemas.ai import InsightSnapshot, ReceiptExtraction


def _object_schemas(value):
    if isinstance(value, list):
        for item in value:
            yield from _object_schemas(item)
        return
    if not isinstance(value, dict):
        return
    if isinstance(value.get("properties"), dict):
        yield value
    for child in value.values():
        yield from _object_schemas(child)


def test_receipt_prompt_has_one_lean_outcome_contract() -> None:
    prompt = build_receipt_prompt("it-IT", "EUR")

    for section in ("goal", "context", "constraints", "success_criteria", "output_contract"):
        assert prompt.count(f"<{section}>") == 1
        assert prompt.count(f"</{section}>") == 1
    assert "Locale: it-IT" in prompt
    assert "Valuta predefinita: EUR" in prompt
    assert "categoryId separatamente a ogni articolo" in prompt
    assert "pensa passo" not in prompt.lower()
    assert "chain of thought" not in prompt.lower()
    assert "internamente" not in RECEIPT_AUDIT_PROTOCOL.lower()


def test_insight_prompt_delimits_localized_major_unit_data() -> None:
    snapshot = InsightSnapshot(
        locale="it-IT",
        currency="EUR",
        period={"start": "2026-08-01", "end": "2026-08-31"},
        total=4625,
        previousTotal=4100,
        categories=[{"id": "food_grocery", "total": 4625}],
        merchants=[],
        items=[],
        priceChanges=[],
    )

    prompt = build_insight_prompt(snapshot)

    assert prompt.count("<input_data>") == 1
    assert prompt.count("</input_data>") == 1
    assert '"total":"46.25"' in prompt
    assert '"category":"Spesa alimentare"' in prompt
    assert "food_grocery" not in prompt
    assert "al massimo tre osservazioni" in prompt
    assert "altrimenti usa null" in prompt


def test_strict_schema_requires_every_declared_property_without_mutation() -> None:
    original = schema_for(ReceiptExtraction)
    untouched = deepcopy(original)

    strict = strict_json_schema(original)

    assert original == untouched
    objects = list(_object_schemas(strict))
    assert objects
    for schema in objects:
        assert schema["additionalProperties"] is False
        assert schema["required"] == list(schema["properties"])
    assert '"default"' not in json.dumps(strict)
