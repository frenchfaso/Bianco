#!/usr/bin/env python3
"""Evaluate GPT-5.6 tiers on Bianco's production insight flow.

The default mode only prints the planned matrix. It does not import backend
dependencies, read OAuth credentials, load fixtures, or contact a provider.
Real calls require both ``--run`` and ``--accept-subscription-usage``.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import os
import re
import statistics
import sys
import tempfile
import time
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable


ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
if str(SERVER) not in sys.path:
    sys.path.insert(0, str(SERVER))

FORMAT_VERSION = 1
SCORING_VERSION = "grounded-selection-v1"
PAIR_TIE_EPSILON = 0.5
PAIR_MIN_CASES = 10
MODELS = ("gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna")
BASE_EFFORTS = ("low", "medium")
HIGH_EFFORT = "high"
SUPPORTED_LOCALES = frozenset({"it-IT", "en-GB", "de-DE", "es-ES", "fr-FR"})
MAX_FIXTURE_BYTES = 2 * 1024 * 1024
MAX_CASES = 100
MAX_SAFE_INTEGER = 9_007_199_254_740_991
MODEL_QUALITY_ERROR_CATEGORIES = frozenset({"structured_output"})
SUMMARY_METRICS = (
    "referenceValidity",
    "emphasisUtility",
    "maxThreeObservations",
    "usefulFactCoverage",
    "suggestionSupported",
    "strictPass",
)

INTERNAL_CATEGORY_IDS = frozenset(
    {
        "food_grocery",
        "restaurant",
        "transport",
        "home",
        "health",
        "personal",
        "entertainment",
        "other",
    }
)

ENTITY_COLLECTION_FIELDS = {
    "categories": "category",
    "merchants": "id",
    "items": "id",
    "priceChanges": "id",
}
SNAPSHOT_ENTITY_COLLECTION_FIELDS = {
    **ENTITY_COLLECTION_FIELDS,
    "categories": "id",
}

LANGUAGE_MARKERS = {
    "it": frozenset(
        {
            "acquisti",
            "aumentata",
            "aumentato",
            "della",
            "diminuita",
            "diminuito",
            "precedente",
            "rispetto",
            "spesa",
            "spese",
        }
    ),
    "en": frozenset(
        {
            "compared",
            "decreased",
            "higher",
            "increased",
            "lower",
            "previous",
            "spending",
            "than",
            "the",
            "with",
        }
    ),
    "de": frozenset(
        {
            "ausgaben",
            "einkaufe",
            "gegenuber",
            "gesunken",
            "gestiegen",
            "niedriger",
            "vormonat",
            "vorperiode",
            "zum",
            "zur",
        }
    ),
    "es": frozenset(
        {
            "anterior",
            "aumento",
            "compras",
            "disminuyo",
            "gasto",
            "gastos",
            "mayor",
            "menor",
            "respecto",
            "vigilar",
        }
    ),
    "fr": frozenset(
        {
            "achats",
            "augmente",
            "baisse",
            "depense",
            "depenses",
            "diminue",
            "hausse",
            "precedente",
            "rapport",
            "surveiller",
        }
    ),
}

MONTHS = {
    "january": 1,
    "janvier": 1,
    "januar": 1,
    "enero": 1,
    "gennaio": 1,
    "february": 2,
    "fevrier": 2,
    "februar": 2,
    "febrero": 2,
    "febbraio": 2,
    "march": 3,
    "mars": 3,
    "marz": 3,
    "marzo": 3,
    "april": 4,
    "avril": 4,
    "abril": 4,
    "aprile": 4,
    "mai": 5,
    "may": 5,
    "mayo": 5,
    "maggio": 5,
    "june": 6,
    "juin": 6,
    "juni": 6,
    "junio": 6,
    "giugno": 6,
    "july": 7,
    "juillet": 7,
    "juli": 7,
    "julio": 7,
    "luglio": 7,
    "august": 8,
    "aout": 8,
    "agosto": 8,
    "september": 9,
    "septembre": 9,
    "septiembre": 9,
    "settembre": 9,
    "october": 10,
    "octobre": 10,
    "oktober": 10,
    "octubre": 10,
    "ottobre": 10,
    "november": 11,
    "noviembre": 11,
    "novembre": 11,
    "december": 12,
    "decembre": 12,
    "dezember": 12,
    "diciembre": 12,
    "dicembre": 12,
}

ISO_DATE_PATTERN = re.compile(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)")
DMY_DATE_PATTERN = re.compile(r"(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)")
NATURAL_DATE_PATTERN = re.compile(
    r"(?<!\w)(\d{1,2})(?:er|st|nd|rd|th)?\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})(?!\d)",
    re.IGNORECASE,
)
NUMBER_PATTERN = re.compile(
    r"(?<![\w])[-+−]?\d+(?:(?:[ \u00a0\u202f]\d{3})|(?:[.,]\d+))*(?:\s?%)?"
)
CASE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")
CLAIM_SUBJECT_PATTERN = re.compile(
    r"^(?:total|category:[A-Za-z0-9_-]{1,80}|(?:merchant|item|priceChange):.{1,300})$"
)
CLAIM_METRICS = frozenset({"current"})
CLAIM_DIRECTIONS = frozenset(
    {"increase", "decrease", "stable", "no_baseline", "none"}
)

TOTAL_ALIASES = {
    "it": ("spesa totale", "totale complessivo", "totale"),
    "en": ("total spending", "overall spending", "overall total", "total"),
    "de": ("gesamtausgaben", "gesamtbetrag", "gesamt"),
    "es": ("gasto total", "gastos totales", "total"),
    "fr": ("depense totale", "depenses totales", "total"),
}

DIRECTION_MARKERS = {
    "increase": {
        "it": ("aument", "crescit", "salit", "in piu"),
        "en": ("increas", "higher", "rose", "risen", "up from"),
        "de": ("gestiegen", "anstieg", "erhoht", "hoher", "zunahme"),
        "es": ("aument", "subio", "subid", "mayor", "crecio"),
        "fr": ("augment", "hausse", "superieur", "progresse"),
    },
    "decrease": {
        "it": ("diminuit", "calat", "sces", "ridott", "in meno"),
        "en": ("decreas", "lower", "fell", "fallen", "down from"),
        "de": ("gesunken", "ruckgang", "niedriger", "abnahme", "gefallen"),
        "es": ("dismin", "baj", "descens", "menor", "cayo"),
        "fr": ("diminu", "baisse", "inferieur", "recul"),
    },
    "stable": {
        "it": ("stabil", "invariat", "senza variazioni"),
        "en": ("stable", "unchanged", "no change", "the same"),
        "de": ("stabil", "unverandert", "gleich geblieben"),
        "es": ("estable", "sin cambios", "sin variacion"),
        "fr": ("stable", "inchange", "sans changement"),
    },
    "no_baseline": {
        "it": (
            "nessun periodo precedente",
            "dati precedenti non disponibili",
            "senza confronto precedente",
        ),
        "en": ("no previous period", "previous data unavailable", "without a previous baseline"),
        "de": ("kein vergleichszeitraum", "keine vorherigen daten", "ohne vorherigen vergleich"),
        "es": ("sin periodo anterior", "no hay datos anteriores", "sin comparacion anterior"),
        "fr": (
            "sans periode precedente",
            "aucune donnee precedente",
            "sans comparaison precedente",
        ),
    },
}

FUTURE_OR_LIMIT_MARKERS = {
    "it": ("mese prossimo", "in futuro", "budget", "limite", "al massimo"),
    "en": ("next month", "in future", "budget", "limit", "at most"),
    "de": ("nachsten monat", "zukunft", "budget", "limit", "hochstens"),
    "es": ("proximo mes", "futuro", "presupuesto", "limite", "como maximo"),
    "fr": ("mois prochain", "avenir", "budget", "limite", "au maximum"),
}


class EvalPreflightError(RuntimeError):
    """A safe-to-display error detected before or outside model evaluation."""


@dataclass(frozen=True)
class PreparedCase:
    case_id: str
    snapshot: Any
    prompt_payload: dict[str, Any]
    expected_claims: tuple[dict[str, str], ...]
    fingerprint: str


@dataclass(frozen=True)
class SubjectFact:
    key: str
    aliases: frozenset[str]
    values: frozenset[str]
    metric_values: dict[str, frozenset[str]]
    direction: str


@dataclass(frozen=True)
class GroundingFacts:
    case_id: str
    language: str
    numbers: frozenset[str]
    dates: frozenset[str]
    entities: frozenset[str]
    entity_catalog: dict[str, tuple[str, frozenset[str]]]
    subjects: dict[str, SubjectFact]
    expected_claims: tuple[dict[str, str], ...]


@dataclass(frozen=True)
class ErrorInfo:
    category: str
    retryable: bool
    status_code: int | None = None


class ClassifiedCallError(RuntimeError):
    def __init__(self, info: ErrorInfo, attempts: int):
        super().__init__(info.category)
        self.info = info
        self.attempts = attempts


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("utf-8")


def sha256_bytes(*parts: bytes) -> str:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(len(part).to_bytes(8, "big"))
        digest.update(part)
    return digest.hexdigest()


def _plain_model(model: Any) -> dict[str, Any]:
    if isinstance(model, dict):
        return model
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json", by_alias=True)
    return {
        "observations": getattr(model, "observations", None),
        "suggestion": getattr(model, "suggestion", None),
    }


def _plain_selection(selection: Any) -> dict[str, Any]:
    if isinstance(selection, dict):
        return selection
    if hasattr(selection, "model_dump"):
        return selection.model_dump(mode="json", by_alias=True)
    return {
        "observations": getattr(selection, "observations", None),
        "suggestionObservation": getattr(
            selection, "suggestion_observation", None
        ),
    }


def _valid_iso_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def _valid_safe_number(value: Any, *, nonnegative: bool = False) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    if not math.isfinite(float(value)) or abs(float(value)) > MAX_SAFE_INTEGER:
        return False
    return not nonnegative or value >= 0


def _validate_snapshot_semantics(snapshot: Any, case_id: str) -> None:
    value = snapshot.model_dump(mode="json", by_alias=True)
    period = value.get("period")
    period_fields = {"start", "end", "previousStart", "previousEnd"}
    if not isinstance(period, dict) or set(period) != period_fields:
        raise EvalPreflightError(f"{case_id}: period must contain the four canonical dates")
    if not all(_valid_iso_date(period[field]) for field in period_fields):
        raise EvalPreflightError(f"{case_id}: period contains an invalid ISO date")
    if period["start"] > period["end"] or period["previousStart"] > period["previousEnd"]:
        raise EvalPreflightError(f"{case_id}: period dates are not ordered")
    for field in ("total", "previousTotal"):
        if not _valid_safe_number(value.get(field), nonnegative=True):
            raise EvalPreflightError(f"{case_id}: {field} must be a safe non-negative number")
    for collection, entity_field in SNAPSHOT_ENTITY_COLLECTION_FIELDS.items():
        entries = value.get(collection)
        if not isinstance(entries, list) or len(entries) > 100:
            raise EvalPreflightError(f"{case_id}: {collection} must be a bounded list")
        for index, entry in enumerate(entries):
            entity = entry.get(entity_field) if isinstance(entry, dict) else None
            if not isinstance(entity, str) or not entity.strip() or len(entity) > 300:
                raise EvalPreflightError(
                    f"{case_id}: {collection}[{index}] has an invalid identity"
                )
            for field, number in entry.items():
                if field == entity_field or number is None:
                    continue
                if not _valid_safe_number(number):
                    raise EvalPreflightError(
                        f"{case_id}: {collection}[{index}].{field} is not a safe number"
                    )


def validate_fixtures(
    path: Path,
    *,
    snapshot_type: Any,
    prompt_data_builder: Callable[[Any], str],
) -> list[PreparedCase]:
    """Validate every public synthetic fixture before provider preflight."""

    raw_path = path.expanduser()
    if raw_path.is_symlink():
        raise EvalPreflightError("fixture file cannot be a symlink")
    try:
        path = raw_path.resolve(strict=True)
    except (FileNotFoundError, OSError) as error:
        raise EvalPreflightError("fixture file does not exist") from error
    if not path.is_file() or not 1 <= path.stat().st_size <= MAX_FIXTURE_BYTES:
        raise EvalPreflightError("fixture file must be a small regular file")
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise EvalPreflightError("fixture file is not valid UTF-8 JSON") from error
    if (
        not isinstance(document, dict)
        or set(document) != {"formatVersion", "synthetic", "description", "cases"}
        or document.get("formatVersion") != 1
        or document.get("synthetic") is not True
        or not isinstance(document.get("description"), str)
    ):
        raise EvalPreflightError("fixture file has an invalid public-synthetic header")
    cases = document.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= MAX_CASES:
        raise EvalPreflightError(f"fixture file must contain 1 to {MAX_CASES} cases")

    prepared: list[PreparedCase] = []
    seen_ids: set[str] = set()
    locales: set[str] = set()
    for index, raw_case in enumerate(cases):
        if not isinstance(raw_case, dict) or set(raw_case) != {
            "id", "snapshot", "expectedClaims"
        }:
            raise EvalPreflightError(
                f"case {index}: expected id, snapshot, and expectedClaims"
            )
        case_id = raw_case.get("id")
        if not isinstance(case_id, str) or not CASE_ID_PATTERN.fullmatch(case_id):
            raise EvalPreflightError(f"case {index}: invalid id")
        if case_id in seen_ids:
            raise EvalPreflightError(f"duplicate case id: {case_id}")
        seen_ids.add(case_id)
        try:
            snapshot = snapshot_type.model_validate(raw_case.get("snapshot"))
        except Exception as error:
            raise EvalPreflightError(f"{case_id}: invalid production snapshot") from error
        canonical = snapshot.model_dump(mode="json", by_alias=True)
        if set(raw_case["snapshot"]) != set(canonical):
            raise EvalPreflightError(f"{case_id}: snapshot must use all canonical fields")
        _validate_snapshot_semantics(snapshot, case_id)
        locales.add(snapshot.locale)
        try:
            prompt_payload = json.loads(prompt_data_builder(snapshot))
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise EvalPreflightError(
                f"{case_id}: production prompt serialization failed"
            ) from error
        if not isinstance(prompt_payload, dict):
            raise EvalPreflightError(f"{case_id}: prompt payload is not an object")
        raw_claims = raw_case.get("expectedClaims")
        if not isinstance(raw_claims, list) or not 3 <= len(raw_claims) <= 20:
            raise EvalPreflightError(
                f"{case_id}: expectedClaims must contain 3 to 20 claims"
            )
        expected_claims: list[dict[str, str]] = []
        seen_claims: set[tuple[str, str]] = set()
        for claim_index, claim in enumerate(raw_claims):
            if not isinstance(claim, dict) or set(claim) != {
                "subject", "metric", "direction"
            }:
                raise EvalPreflightError(
                    f"{case_id}: expectedClaims[{claim_index}] has invalid fields"
                )
            subject = claim.get("subject")
            metric = claim.get("metric")
            direction = claim.get("direction")
            if (
                not isinstance(subject, str)
                or not CLAIM_SUBJECT_PATTERN.fullmatch(subject)
                or metric not in CLAIM_METRICS
                or direction not in CLAIM_DIRECTIONS
                or (subject == "total" and direction == "none")
            ):
                raise EvalPreflightError(
                    f"{case_id}: expectedClaims[{claim_index}] is invalid"
                )
            key = (subject, metric)
            if key in seen_claims:
                raise EvalPreflightError(f"{case_id}: duplicate expected claim {subject}")
            seen_claims.add(key)
            expected_claims.append(
                {"subject": subject, "metric": metric, "direction": direction}
            )
        prepared_case = PreparedCase(
            case_id=case_id,
            snapshot=snapshot,
            prompt_payload=prompt_payload,
            expected_claims=tuple(expected_claims),
            fingerprint=sha256_bytes(
                case_id.encode("utf-8"),
                canonical_json(canonical),
                canonical_json(prompt_payload),
                canonical_json(expected_claims),
            ),
        )
        subjects = build_subject_facts(prepared_case)
        for claim in expected_claims:
            subject = subjects.get(claim["subject"])
            if subject is None:
                raise EvalPreflightError(
                    f"{case_id}: expected claim subject is absent: {claim['subject']}"
                )
            if subject.direction != claim["direction"]:
                raise EvalPreflightError(
                    f"{case_id}: expected direction disagrees with production data for "
                    f"{claim['subject']}"
                )
            if not subject.metric_values.get(claim["metric"]):
                raise EvalPreflightError(
                    f"{case_id}: expected metric is absent for {claim['subject']}"
                )
        prepared.append(prepared_case)
    if locales != SUPPORTED_LOCALES:
        missing = ", ".join(sorted(SUPPORTED_LOCALES - locales)) or "none"
        raise EvalPreflightError(
            f"fixtures must cover each supported locale exactly as a set; missing: {missing}"
        )
    return prepared


def _strip_accents(value: str) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(character)
    )


def normalize_text(value: str) -> str:
    folded = _strip_accents(unicodedata.normalize("NFKC", value).casefold())
    return " ".join(re.sub(r"[^\w]+", " ", folded, flags=re.UNICODE).split())


def _entity_values(payload: dict[str, Any]) -> set[str]:
    entities: set[str] = set()
    for collection, entity_field in ENTITY_COLLECTION_FIELDS.items():
        for entry in payload.get(collection, []):
            value = entry.get(entity_field) if isinstance(entry, dict) else None
            if isinstance(value, str) and value.strip():
                entities.add(value.strip())
    return entities


def build_entity_catalog(
    cases: Iterable[PreparedCase],
) -> dict[str, tuple[str, frozenset[str]]]:
    catalog: dict[str, tuple[str, set[str]]] = {}
    for case in cases:
        for display in _entity_values(case.prompt_payload):
            key = normalize_text(display)
            if not key:
                continue
            existing_display, case_ids = catalog.setdefault(key, (display, set()))
            catalog[key] = (existing_display, case_ids | {case.case_id})
    return {
        key: (display, frozenset(case_ids))
        for key, (display, case_ids) in catalog.items()
    }


def _decimal_string(value: Decimal) -> str:
    if value == 0:
        return "0"
    rendered = format(value.normalize(), "f")
    return rendered.rstrip("0").rstrip(".") if "." in rendered else rendered


def normalize_number(value: Any) -> str | None:
    if isinstance(value, bool):
        return None
    raw = str(value).strip().replace("\u00a0", "").replace(" ", "")
    raw = raw.rstrip("%").replace("€", "").replace("$", "").replace("£", "")
    if not raw:
        return None
    if "," in raw and "." in raw:
        decimal_separator = "," if raw.rfind(",") > raw.rfind(".") else "."
        thousands_separator = "." if decimal_separator == "," else ","
        raw = raw.replace(thousands_separator, "").replace(decimal_separator, ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        number = Decimal(raw)
    except InvalidOperation:
        return None
    if not number.is_finite():
        return None
    return _decimal_string(number)


def normalize_output_number(value: Any, language: str) -> str | None:
    """Parse localized model prose, including unambiguous thousands groups."""

    raw = (
        str(value).strip().replace("−", "-").replace("\u00a0", "").replace("\u202f", "")
    )
    is_percent = raw.endswith("%")
    raw = raw.rstrip("%").replace("€", "").replace("$", "").replace("£", "")
    raw = raw.replace(" ", "")
    if not raw:
        return None
    if "," in raw and "." in raw:
        decimal_separator = "," if raw.rfind(",") > raw.rfind(".") else "."
        thousands_separator = "." if decimal_separator == "," else ","
        raw = raw.replace(thousands_separator, "").replace(decimal_separator, ".")
    elif "," in raw or "." in raw:
        separator = "," if "," in raw else "."
        groups = raw.lstrip("+-").split(separator)
        locale_thousands = "," if language == "en" else "."
        looks_grouped = (
            not is_percent
            and separator == locale_thousands
            and len(groups) > 1
            and all(len(group) == 3 for group in groups[1:])
        )
        raw = raw.replace(separator, "" if looks_grouped else ".")
    try:
        number = Decimal(raw)
    except InvalidOperation:
        return None
    if not number.is_finite():
        return None
    return _decimal_string(number)


def _number_variants(value: Any) -> set[str]:
    normalized = normalize_number(value)
    if normalized is None:
        return set()
    number = Decimal(normalized)
    candidates = {number, abs(number)}
    variants: set[str] = set()
    for candidate in candidates:
        variants.add(_decimal_string(candidate))
        for places in range(3):
            quantum = Decimal(1).scaleb(-places)
            variants.add(
                _decimal_string(candidate.quantize(quantum, rounding=ROUND_HALF_UP))
            )
    return variants


def _direction(previous: Any, difference: Any) -> str:
    if previous in {None, 0, 0.0, "0", "0.00"}:
        return "no_baseline"
    normalized = normalize_number(difference)
    if normalized is None:
        return "none"
    value = Decimal(normalized)
    if value > 0:
        return "increase"
    if value < 0:
        return "decrease"
    return "stable"


def _entry_values(entry: dict[str, Any]) -> frozenset[str]:
    values: set[str] = set()
    for field, value in entry.items():
        if field in {"id", "category"} or value is None or isinstance(value, bool):
            continue
        if isinstance(value, (int, float, str)):
            values.update(_number_variants(value))
    return frozenset(values)


def build_subject_facts(case: PreparedCase) -> dict[str, SubjectFact]:
    """Build entity/value associations from the exact production prompt payload."""

    payload = case.prompt_payload
    canonical = case.snapshot.model_dump(mode="json", by_alias=True)
    language = case.snapshot.locale.split("-", 1)[0].lower()
    subjects: dict[str, SubjectFact] = {}

    total_current = payload.get("total")
    total_previous = payload.get("previousTotal")
    try:
        current_decimal = Decimal(str(total_current))
        previous_decimal = Decimal(str(total_previous))
        total_difference = str(current_decimal - previous_decimal)
        total_change_percent = (
            str((current_decimal - previous_decimal) * Decimal(100) / previous_decimal)
            if previous_decimal != 0
            else None
        )
    except (InvalidOperation, TypeError):
        total_difference = None
        total_change_percent = None
    total_entry = {
        "current": total_current,
        "previous": total_previous,
        "difference": total_difference,
        "changePercent": total_change_percent,
    }
    total_values = _entry_values(total_entry)
    subjects["total"] = SubjectFact(
        key="total",
        aliases=frozenset(normalize_text(value) for value in TOTAL_ALIASES[language]),
        values=total_values,
        metric_values={"current": frozenset(_number_variants(total_current))},
        direction=_direction(total_previous, total_difference),
    )

    specs = (
        ("categories", "category", "category", "id", "total"),
        ("merchants", "merchant", "id", "id", "total"),
        ("items", "item", "id", "id", "total"),
        ("priceChanges", "priceChange", "id", "id", "latest"),
    )
    for collection, prefix, display_field, source_field, current_field in specs:
        prompt_entries = payload.get(collection, [])
        source_entries = canonical.get(collection, [])
        for prompt_entry, source_entry in zip(prompt_entries, source_entries, strict=True):
            if not isinstance(prompt_entry, dict) or not isinstance(source_entry, dict):
                continue
            source_id = source_entry.get(source_field)
            display = prompt_entry.get(display_field)
            if not isinstance(source_id, str) or not isinstance(display, str):
                continue
            key = f"{prefix}:{source_id}"
            previous = prompt_entry.get(
                "previousAverage" if collection == "priceChanges" else "previousTotal"
            )
            direction = (
                "none"
                if collection == "items"
                else _direction(previous, prompt_entry.get("difference"))
            )
            subjects[key] = SubjectFact(
                key=key,
                aliases=frozenset({normalize_text(display)}),
                values=_entry_values(prompt_entry),
                metric_values={
                    "current": frozenset(
                        _number_variants(prompt_entry.get(current_field))
                    )
                },
                direction=direction,
            )
    return subjects


def _walk_values(value: Any) -> Iterable[Any]:
    if isinstance(value, dict):
        for child in value.values():
            yield from _walk_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_values(child)
    else:
        yield value


def build_grounding_facts(
    case: PreparedCase,
    entity_catalog: dict[str, tuple[str, frozenset[str]]],
) -> GroundingFacts:
    numbers: set[str] = set()
    dates: set[str] = set()
    for value in _walk_values(case.prompt_payload):
        if isinstance(value, str) and _valid_iso_date(value):
            dates.add(value)
            parsed = date.fromisoformat(value)
            for component in (parsed.day, parsed.month, parsed.year):
                numbers.update(_number_variants(component))
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            numbers.update(_number_variants(value))
        elif isinstance(value, str) and re.fullmatch(r"[-+]?\d+(?:[.,]\d+)?", value):
            numbers.update(_number_variants(value))
    subjects = build_subject_facts(case)
    for subject in subjects.values():
        numbers.update(subject.values)
    return GroundingFacts(
        case_id=case.case_id,
        language=case.snapshot.locale.split("-", 1)[0].lower(),
        numbers=frozenset(numbers),
        dates=frozenset(dates),
        entities=frozenset(
            normalize_text(value) for value in _entity_values(case.prompt_payload)
        ),
        entity_catalog=entity_catalog,
        subjects=subjects,
        expected_claims=case.expected_claims,
    )


def _date_matches(text: str) -> list[tuple[str, tuple[int, int]]]:
    matches: list[tuple[str, tuple[int, int]]] = []
    for match in ISO_DATE_PATTERN.finditer(text):
        try:
            normalized = date(int(match[1]), int(match[2]), int(match[3])).isoformat()
        except ValueError:
            normalized = match.group(0)
        matches.append((normalized, match.span()))
    for match in DMY_DATE_PATTERN.finditer(text):
        try:
            normalized = date(int(match[3]), int(match[2]), int(match[1])).isoformat()
        except ValueError:
            normalized = match.group(0)
        matches.append((normalized, match.span()))
    for match in NATURAL_DATE_PATTERN.finditer(text):
        month = MONTHS.get(normalize_text(match[2]))
        if month is None:
            continue
        try:
            normalized = date(int(match[3]), month, int(match[1])).isoformat()
        except ValueError:
            normalized = match.group(0)
        matches.append((normalized, match.span()))
    return matches


def extract_facts(text: str, facts: GroundingFacts) -> dict[str, Any]:
    date_matches = _date_matches(text)
    dates = {value for value, _span in date_matches}
    without_dates = list(text)
    for _value, (start, end) in date_matches:
        without_dates[start:end] = " " * (end - start)
    numbers = {
        normalized
        for match in NUMBER_PATTERN.finditer("".join(without_dates))
        if (
            normalized := normalize_output_number(match.group(0), facts.language)
        ) is not None
    }
    normalized_output = f" {normalize_text(text)} "
    mentioned_entities: set[str] = set()
    foreign_entities: set[str] = set()
    for key, (display, case_ids) in facts.entity_catalog.items():
        if f" {key} " not in normalized_output:
            continue
        mentioned_entities.add(display)
        if facts.case_id not in case_ids:
            foreign_entities.add(display)
    for identifier in INTERNAL_CATEGORY_IDS:
        # Some English labels intentionally equal their stable ID (for example
        # "home"). They are valid when that localized label exists in this case.
        if identifier not in facts.entities and f" {identifier} " in normalized_output:
            foreign_entities.add(identifier)
    return {
        "numbers": numbers,
        "dates": dates,
        "mentionedEntities": mentioned_entities,
        "ungroundedNumbers": numbers - facts.numbers,
        "ungroundedDates": dates - facts.dates,
        "foreignEntities": foreign_entities,
        "hasEvidence": bool(
            (numbers & facts.numbers)
            or (dates & facts.dates)
            or any(normalize_text(entity) in facts.entities for entity in mentioned_entities)
        ),
    }


def _split_claim_segments(text: str) -> list[str]:
    # Keep decimal punctuation inside a segment while separating ordinary prose
    # clauses. Exact entity/value association is deliberately conservative.
    return [
        value.strip()
        for value in re.split(
            r";+|\n+|(?<!\d)[.!?]+|[.!?]+(?!\d)",
            text,
        )
        if value.strip()
    ]


def _direction_signals(text: str, language: str) -> set[str]:
    normalized = f" {normalize_text(text)} "
    signals: set[str] = set()
    for direction, localized in DIRECTION_MARKERS.items():
        if any(marker in normalized for marker in localized.get(language, ())):
            signals.add(direction)
    return signals


def _subject_mentions(text: str, facts: GroundingFacts) -> set[str]:
    normalized = f" {normalize_text(text)} "
    return {
        key
        for key, subject in facts.subjects.items()
        if any(f" {alias} " in normalized for alias in subject.aliases if alias)
    }


def analyze_claim_associations(text: str, facts: GroundingFacts) -> dict[str, Any]:
    segments: list[dict[str, Any]] = []
    ungrounded_numbers: set[str] = set()
    misattributed: list[dict[str, Any]] = []
    wrong_directions: list[dict[str, Any]] = []
    covered_claims: set[tuple[str, str]] = set()
    for segment_index, segment in enumerate(_split_claim_segments(text)):
        subjects = _subject_mentions(segment, facts)
        numeric_segment = list(segment)
        for _value, (start, end) in _date_matches(segment):
            numeric_segment[start:end] = " " * (end - start)
        number_matches = list(NUMBER_PATTERN.finditer("".join(numeric_segment)))
        numbers = {
            normalized
            for match in number_matches
            if (
                normalized := normalize_output_number(match.group(0), facts.language)
            ) is not None
        }
        signals = _direction_signals(segment, facts.language)
        for match in number_matches:
            signed = match.group(0).lstrip()
            if signed.startswith("+"):
                signals.add("increase")
            elif signed.startswith(("-", "−")):
                signals.add("decrease")
        ungrounded_numbers.update(numbers - facts.numbers)
        allowed = set().union(
            *(facts.subjects[key].values for key in subjects)
        ) if subjects else set()
        for number in sorted(numbers & facts.numbers):
            if subjects and number not in allowed:
                misattributed.append(
                    {
                        "segment": segment_index,
                        "number": number,
                        "subjects": sorted(subjects),
                    }
                )
        for key in sorted(subjects):
            expected_direction = facts.subjects[key].direction
            directional = signals & {"increase", "decrease", "stable"}
            wrong = False
            if expected_direction == "no_baseline":
                wrong = bool(directional)
            elif expected_direction in {"increase", "decrease", "stable"}:
                wrong = bool(directional - {expected_direction}) and (
                    expected_direction not in directional
                )
            if wrong:
                wrong_directions.append(
                    {
                        "segment": segment_index,
                        "subject": key,
                        "expected": expected_direction,
                        "observed": sorted(signals),
                    }
                )
        segment_has_error = bool(
            (numbers - facts.numbers)
            or any(item["segment"] == segment_index for item in misattributed)
            or any(item["segment"] == segment_index for item in wrong_directions)
        )
        for claim in facts.expected_claims:
            subject = facts.subjects[claim["subject"]]
            expected_direction = claim["direction"]
            direction_supported = (
                expected_direction in {"none", "no_baseline"}
                or expected_direction in signals
            )
            if (
                not segment_has_error
                and claim["subject"] in subjects
                and bool(numbers & subject.metric_values[claim["metric"]])
                and direction_supported
            ):
                covered_claims.add((claim["subject"], claim["metric"]))
        segments.append(
            {
                "subjects": sorted(subjects),
                "numbers": numbers,
                "directions": sorted(signals),
                "hasAssociatedEvidence": bool(
                    subjects
                    and numbers
                    and not segment_has_error
                    and bool(numbers & allowed)
                ),
            }
        )
    return {
        "segments": segments,
        "ungroundedNumbers": ungrounded_numbers,
        "misattributedClaims": misattributed,
        "wrongDirectionClaims": wrong_directions,
        "coveredExpectedClaims": covered_claims,
    }


def language_scores(text: str) -> dict[str, int]:
    words = set(normalize_text(text).split())
    return {
        language: len(words & markers)
        for language, markers in LANGUAGE_MARKERS.items()
    }


def selection_expectations(case: PreparedCase) -> dict[str, dict[str, Any]]:
    """Derive allowed and useful refs from fixture claims plus production data.

    Fixtures already declare the facts considered relevant. Their semantic
    subjects are mapped to the opaque refs in the exact production prompt; a
    changing comparison is useful with ``change``, while a no-baseline/current
    fact is useful with ``current``. Recurring items are useful as frequency.
    """
    canonical = case.snapshot.model_dump(mode="json", by_alias=True)
    prompt = case.prompt_payload
    by_subject: dict[str, tuple[str, dict[str, Any]]] = {
        "total": (
            str(prompt.get("totalRef", "total")),
            {
                "allowedEmphasis": prompt.get("totalAllowedEmphasis", []),
                "suggestionAllowed": prompt.get("totalSuggestionAllowed") is True,
            },
        )
    }
    specs = (
        ("categories", "category", "id"),
        ("merchants", "merchant", "id"),
        ("items", "item", "id"),
        ("priceChanges", "priceChange", "id"),
    )
    for collection, subject_prefix, identity_field in specs:
        for source, exposed in zip(
            canonical.get(collection, []),
            prompt.get(collection, []),
            strict=True,
        ):
            if not isinstance(source, dict) or not isinstance(exposed, dict):
                continue
            identity = source.get(identity_field)
            ref = exposed.get("ref")
            if isinstance(identity, str) and isinstance(ref, str):
                by_subject[f"{subject_prefix}:{identity}"] = (ref, exposed)

    expectations: dict[str, dict[str, Any]] = {}
    for subject, (ref, exposed) in by_subject.items():
        if subject.startswith("item:"):
            useful = "frequency" if exposed.get("frequency", 0) >= 2 else "current"
        else:
            previous = exposed.get(
                "previousAverage" if subject.startswith("priceChange:") else "previousTotal"
            )
            useful = (
                "change"
                if previous not in {None, 0, "0", "0.00"}
                else "current"
            )
        expectations[ref] = {
            "subject": subject,
            "allowedEmphasis": frozenset(exposed.get("allowedEmphasis", [])),
            "usefulEmphasis": useful,
            "suggestionAllowed": exposed.get("suggestionAllowed") is True,
            "salient": False,
        }
    for claim in case.expected_claims:
        mapped = by_subject.get(claim["subject"])
        if mapped is None:
            continue
        ref, exposed = mapped
        if claim["subject"].startswith("item:"):
            useful = "frequency" if exposed.get("frequency", 0) >= 2 else "current"
        elif claim["direction"] in {"increase", "decrease", "stable"}:
            useful = "change"
        else:
            useful = "current"
        allowed = frozenset(exposed.get("allowedEmphasis", []))
        expectations[ref] = {
            "subject": claim["subject"],
            "allowedEmphasis": allowed,
            "usefulEmphasis": useful,
            "suggestionAllowed": exposed.get("suggestionAllowed") is True,
            "salient": True,
        }
    return expectations


def score_selection(case: PreparedCase, actual: Any) -> dict[str, Any]:
    """Score the model decision before deterministic prose rendering."""
    payload = _plain_selection(actual)
    observations = payload.get("observations")
    suggestion_index = payload.get("suggestionObservation")
    schema_valid = (
        set(payload) == {"observations", "suggestionObservation"}
        and isinstance(observations, list)
        and all(
            isinstance(entry, dict)
            and set(entry) == {"ref", "emphasis"}
            and isinstance(entry.get("ref"), str)
            and entry.get("emphasis") in {"current", "change", "frequency"}
            for entry in observations
        )
        and (
            suggestion_index is None
            or (type(suggestion_index) is int and suggestion_index >= 0)
        )
    )
    if not isinstance(observations, list):
        observations = []
    observations = [entry for entry in observations if isinstance(entry, dict)]
    expectations = selection_expectations(case)
    refs = [entry.get("ref") for entry in observations]
    valid_rows: list[bool] = []
    useful_rows: list[bool] = []
    for entry in observations:
        expected = expectations.get(entry.get("ref"))
        valid = bool(
            expected and entry.get("emphasis") in expected["allowedEmphasis"]
        )
        valid_rows.append(valid)
        useful_rows.append(bool(
            valid and entry.get("emphasis") == expected["usefulEmphasis"]
        ))
    unique_refs = len(refs) == len(set(refs))
    reference_validity = 1.0 if all(valid_rows) and unique_refs else 0.0
    emphasis_utility = (
        sum(useful_rows) / len(observations) if observations else 0.0
    )
    max_three = 1.0 if len(observations) <= 3 else 0.0
    covered = {
        entry.get("ref")
        for entry, useful in zip(observations, useful_rows, strict=True)
        if useful and expectations.get(entry.get("ref"), {}).get("salient")
    }
    salient_refs = {
        ref for ref, expectation in expectations.items() if expectation["salient"]
    }
    denominator = min(3, len(salient_refs))
    useful_coverage = (
        min(1.0, len(covered) / denominator) if denominator else 1.0
    )
    suggestion_supported = 1.0
    if suggestion_index is not None:
        suggestion_supported = 0.0
        if type(suggestion_index) is int and 0 <= suggestion_index < len(observations):
            entry = observations[suggestion_index]
            expected = expectations.get(entry.get("ref"))
            suggestion_supported = 1.0 if (
                expected
                and expected["suggestionAllowed"]
                and entry.get("emphasis") in {"change", "frequency"}
                and entry.get("emphasis") == expected["usefulEmphasis"]
            ) else 0.0
    strict_pass = 1.0 if all(metric == 1.0 for metric in (
        1.0 if schema_valid else 0.0,
        reference_validity,
        emphasis_utility,
        max_three,
        useful_coverage,
        suggestion_supported,
    )) else 0.0
    quality = 100 * (
        0.15 * (1.0 if schema_valid else 0.0)
        + 0.20 * reference_validity
        + 0.20 * emphasis_utility
        + 0.10 * max_three
        + 0.25 * useful_coverage
        + 0.10 * suggestion_supported
    )
    if not schema_valid or reference_validity < 1.0:
        quality *= 0.15
    return {
        "schemaValidity": 1.0 if schema_valid else 0.0,
        "referenceValidity": reference_validity,
        "emphasisUtility": emphasis_utility,
        "maxThreeObservations": max_three,
        "usefulFactCoverage": useful_coverage,
        "suggestionSupported": suggestion_supported,
        "strictPass": strict_pass,
        "quality": round(quality, 3),
        "diagnostics": {
            "unknownOrDisallowedRefs": [
                ref for ref, valid in zip(refs, valid_rows, strict=True) if not valid
            ],
            "unhelpfulEmphasisRefs": [
                ref for ref, useful in zip(refs, useful_rows, strict=True) if not useful
            ],
            "coveredSalientRefs": sorted(covered),
            "expectedSalientRefs": sorted(salient_refs),
        },
    }


def score_output(
    case: PreparedCase,
    actual: Any,
    entity_catalog: dict[str, tuple[str, frozenset[str]]],
) -> dict[str, Any]:
    payload = _plain_model(actual)
    observations = payload.get("observations")
    suggestion = payload.get("suggestion")
    schema_valid = (
        set(payload) == {"observations", "suggestion"}
        and isinstance(observations, list)
        and all(isinstance(value, str) for value in observations)
        and (suggestion is None or isinstance(suggestion, str))
    )
    if not isinstance(observations, list):
        observations = []
    observations = [value for value in observations if isinstance(value, str)]
    suggestion_text = suggestion if isinstance(suggestion, str) else ""
    facts = build_grounding_facts(case, entity_catalog)
    all_text = "\n".join([*observations, suggestion_text])
    all_analysis = extract_facts(all_text, facts)
    observation_analysis = [extract_facts(value, facts) for value in observations]
    suggestion_analysis = extract_facts(suggestion_text, facts) if suggestion_text else None
    all_claim_analysis = analyze_claim_associations(all_text, facts)
    observation_claims = [
        analyze_claim_associations(value, facts) for value in observations
    ]
    suggestion_claims = (
        analyze_claim_associations(suggestion_text, facts) if suggestion_text else None
    )

    number_grounding = 0.0 if (
        all_analysis["ungroundedNumbers"]
        or all_claim_analysis["ungroundedNumbers"]
    ) else 1.0
    date_grounding = 0.0 if all_analysis["ungroundedDates"] else 1.0
    entity_grounding = 0.0 if all_analysis["foreignEntities"] else 1.0
    claim_association_grounding = 0.0 if (
        all_claim_analysis["misattributedClaims"]
    ) else 1.0
    direction_grounding = 0.0 if (
        all_claim_analysis["wrongDirectionClaims"]
    ) else 1.0
    factual_grounding = min(
        number_grounding,
        date_grounding,
        entity_grounding,
        claim_association_grounding,
        direction_grounding,
    )
    marker_scores = language_scores(all_text)
    target_score = marker_scores.get(facts.language, 0)
    competitor_score = max(
        (score for language, score in marker_scores.items() if language != facts.language),
        default=0,
    )
    language_match = (
        None
        if target_score == competitor_score == 0
        else (1.0 if target_score > competitor_score else 0.0)
    )
    max_three = 1.0 if len(observations) <= 3 else 0.0
    evidence_coverage = (
        sum(
            any(segment["hasAssociatedEvidence"] for segment in analysis["segments"])
            for analysis in observation_claims
        ) / len(observation_claims)
        if observation_claims
        else 0.0
    )
    quantified_coverage = (
        sum(
            bool(
                (analysis["numbers"] & facts.numbers)
                or (analysis["dates"] & facts.dates)
            )
            for analysis in observation_analysis
        )
        / len(observation_analysis)
        if observation_analysis
        else 0.0
    )
    covered_claims = set().union(
        *(analysis["coveredExpectedClaims"] for analysis in observation_claims)
    ) if observation_claims else set()
    useful_denominator = min(3, len(facts.expected_claims))
    useful_fact_coverage = (
        min(1.0, len(covered_claims) / useful_denominator)
        if useful_denominator
        else 1.0
    )
    suggestion_supported = 1.0
    if suggestion_text.strip():
        normalized_suggestion = f" {normalize_text(suggestion_text)} "
        future_or_limit = any(
            marker in normalized_suggestion
            for marker in FUTURE_OR_LIMIT_MARKERS.get(facts.language, ())
        )
        suggestion_supported = 1.0 if (
            suggestion_analysis["hasEvidence"]
            and not suggestion_analysis["ungroundedNumbers"]
            and not suggestion_analysis["ungroundedDates"]
            and not suggestion_analysis["foreignEntities"]
            and suggestion_claims
            and not suggestion_claims["misattributedClaims"]
            and not suggestion_claims["wrongDirectionClaims"]
            and any(
                segment["hasAssociatedEvidence"]
                for segment in suggestion_claims["segments"]
            )
            and not future_or_limit
        ) else 0.0
    strict_pass = 1.0 if all(
        metric == 1.0
        for metric in (
            1.0 if schema_valid else 0.0,
            factual_grounding,
            max_three,
            evidence_coverage,
            useful_fact_coverage,
            suggestion_supported,
        )
    ) else 0.0
    language_quality = 1.0 if language_match is None else language_match
    quality = 100 * (
        0.35 * factual_grounding
        + 0.05 * language_quality
        + 0.05 * max_three
        + 0.10 * evidence_coverage
        + 0.10 * quantified_coverage
        + 0.25 * useful_fact_coverage
        + 0.10 * suggestion_supported
    )
    # A wrong amount (especially the common cents x100 error), internal ID, or
    # hallucinated entity is materially worse than a merely incomplete insight.
    if factual_grounding < 1.0:
        quality *= 0.15
    if language_match == 0.0:
        quality *= 0.25
    if observations and quantified_coverage == 0.0:
        quality *= 0.60
    unsupported_observations = [
        index for index, analysis in enumerate(observation_claims)
        if not any(
            segment["hasAssociatedEvidence"] for segment in analysis["segments"]
        )
    ]
    return {
        "schemaValidity": 1.0 if schema_valid else 0.0,
        "factualGrounding": factual_grounding,
        "numberGrounding": number_grounding,
        "dateGrounding": date_grounding,
        "entityGrounding": entity_grounding,
        "claimAssociationGrounding": claim_association_grounding,
        "directionGrounding": direction_grounding,
        "languageMatch": language_match,
        "maxThreeObservations": max_three,
        "observationEvidenceCoverage": evidence_coverage,
        "quantifiedObservationCoverage": quantified_coverage,
        "usefulFactCoverage": useful_fact_coverage,
        "suggestionSupported": suggestion_supported,
        "strictPass": strict_pass,
        "quality": round(quality, 3),
        "diagnostics": {
            "ungroundedNumbers": sorted(all_analysis["ungroundedNumbers"]),
            "ungroundedDates": sorted(all_analysis["ungroundedDates"]),
            "foreignEntities": sorted(all_analysis["foreignEntities"]),
            "misattributedClaims": all_claim_analysis["misattributedClaims"],
            "wrongDirectionClaims": all_claim_analysis["wrongDirectionClaims"],
            "coveredExpectedClaims": [
                {"subject": subject, "metric": metric}
                for subject, metric in sorted(covered_claims)
            ],
            "unsupportedObservationIndexes": unsupported_observations,
            "languageMarkerScores": marker_scores,
        },
    }


def failure_metrics(*, counts_against_quality: bool) -> dict[str, Any]:
    value = 0.0 if counts_against_quality else None
    return {
        "schemaValidity": 0.0 if counts_against_quality else None,
        **{metric: value for metric in SUMMARY_METRICS},
        "quality": value,
        "diagnostics": None,
    }


def classify_error(error: BaseException) -> ErrorInfo:
    if isinstance(error, PermissionError):
        return ErrorInfo("authentication", False)
    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int):
        if status_code in {401, 403}:
            return ErrorInfo("authentication", False, status_code)
        if status_code == 429:
            return ErrorInfo("rate_limit", True, status_code)
        if status_code in {408, 425}:
            return ErrorInfo("transport", True, status_code)
        if 500 <= status_code <= 599:
            return ErrorInfo("provider_unavailable", True, status_code)
        if status_code == 404:
            return ErrorInfo("model_unavailable", False, status_code)
        return ErrorInfo("request_rejected", False, status_code)
    error_type = type(error).__name__
    if error_type in {
        "TimeoutException",
        "ConnectTimeout",
        "ReadTimeout",
        "WriteTimeout",
        "PoolTimeout",
    }:
        return ErrorInfo("timeout", True)
    if error_type in {
        "ConnectError",
        "NetworkError",
        "ReadError",
        "WriteError",
        "RemoteProtocolError",
    }:
        return ErrorInfo("transport", True)
    if error_type in {"ValidationError", "JSONDecodeError"}:
        return ErrorInfo("structured_output", False)
    if isinstance(error, ValueError):
        return ErrorInfo("configuration", False)
    if isinstance(error, OSError):
        return ErrorInfo("local_io", False)
    if isinstance(error, RuntimeError):
        message = str(error).casefold()
        if "credential" in message or "subscription" in message:
            return ErrorInfo("authentication", False)
        return ErrorInfo("provider_response", True)
    return ErrorInfo("unexpected", False)


def _retry_after_seconds(error: BaseException, fallback: float) -> float:
    response = getattr(error, "response", None)
    headers = getattr(response, "headers", None)
    raw = headers.get("Retry-After") if headers is not None else None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        value = fallback
    return max(0.0, min(60.0, value))


async def call_with_retry(
    operation: Callable[[], Awaitable[Any]],
    *,
    transient_retries: int,
    retry_base_seconds: float,
    sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
) -> tuple[Any, int]:
    attempts = 0
    while True:
        attempts += 1
        try:
            return await operation(), attempts
        except Exception as error:
            info = classify_error(error)
            if not info.retryable or attempts > transient_retries:
                raise ClassifiedCallError(info, attempts) from error
            await sleep(
                _retry_after_seconds(
                    error, retry_base_seconds * (2 ** (attempts - 1))
                )
            )


def aggregate(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for result in results:
        groups.setdefault((result["model"], result["reasoningEffort"]), []).append(result)
    model_order = {model: position for position, model in enumerate(MODELS)}
    effort_order = {
        effort: position
        for position, effort in enumerate((*BASE_EFFORTS, HIGH_EFFORT))
    }
    summaries: list[dict[str, Any]] = []
    for (model, effort), rows in sorted(
        groups.items(),
        key=lambda group: (
            model_order.get(group[0][0], 99),
            effort_order.get(group[0][1], 99),
        ),
    ):
        successful = [row for row in rows if row.get("status") == "ok"]
        latencies = sorted(
            float(row["latencyMs"])
            for row in rows
            if isinstance(row.get("latencyMs"), (int, float))
        )
        p95_index = max(
            0,
            min(len(latencies) - 1, (95 * len(latencies) + 99) // 100 - 1),
        )
        error_counts: dict[str, int] = {}
        for row in rows:
            category = (row.get("error") or {}).get("category")
            if isinstance(category, str):
                error_counts[category] = error_counts.get(category, 0) + 1
        metrics: dict[str, dict[str, float | int | None]] = {}
        for name in ("schemaValidity", *SUMMARY_METRICS):
            effective = [
                float(row[name])
                for row in rows
                if isinstance(row.get(name), (int, float))
            ]
            valid = [
                float(row[name])
                for row in successful
                if isinstance(row.get(name), (int, float))
            ]
            metrics[name] = {
                "scoredCases": len(effective),
                "effectiveMean": statistics.fmean(effective) if effective else None,
                "meanOnValid": statistics.fmean(valid) if valid else None,
            }
        effective_quality = [
            float(row["quality"])
            for row in rows
            if isinstance(row.get("quality"), (int, float))
        ]
        valid_quality = [
            float(row["quality"])
            for row in successful
            if isinstance(row.get("quality"), (int, float))
        ]
        summaries.append(
            {
                "model": model,
                "reasoningEffort": effort,
                "cases": len(rows),
                "successfulCases": len(successful),
                "successRate": len(successful) / len(rows),
                "effectiveQuality": (
                    statistics.fmean(effective_quality) if effective_quality else None
                ),
                "meanQualityOnValid": (
                    statistics.fmean(valid_quality) if valid_quality else None
                ),
                "meanAttempts": statistics.fmean(
                    float(row.get("attempts", 1)) for row in rows
                ),
                "meanLatencyMs": (
                    round(statistics.fmean(latencies)) if latencies else None
                ),
                "p95LatencyMs": latencies[p95_index] if latencies else None,
                "errorCounts": dict(sorted(error_counts.items())),
                "metrics": metrics,
            }
        )
    return summaries


def paired_comparisons(
    results: list[dict[str, Any]],
    scheduled_keys: set[tuple[str, str, str]] | None = None,
) -> dict[str, Any]:
    """Compare configurations on identical cases instead of only averaging.

    Infrastructure failures have ``quality=None`` and are excluded. Structured
    output/provider-response failures count as zero, matching ``aggregate``.
    A strict pass wins before quality is compared; otherwise differences of at
    most half a quality point are ties to avoid meaningless floating-point wins.
    """

    all_cases: dict[tuple[str, str], set[str]] = {}
    if scheduled_keys is not None:
        for fingerprint, model, effort in scheduled_keys:
            all_cases.setdefault((model, effort), set()).add(fingerprint)
    configs: dict[tuple[str, str], dict[str, dict[str, Any]]] = {}
    for result in results:
        quality = result.get("quality")
        fingerprint = result.get("caseFingerprint")
        model = result.get("model")
        effort = result.get("reasoningEffort")
        if (
            not isinstance(fingerprint, str)
            or not fingerprint
            or not isinstance(model, str)
            or not isinstance(effort, str)
        ):
            continue
        config = (model, effort)
        if scheduled_keys is None:
            all_cases.setdefault(config, set()).add(fingerprint)
        if not isinstance(quality, (int, float)) or isinstance(quality, bool):
            continue
        configs.setdefault(config, {})[fingerprint] = result

    model_order = {model: position for position, model in enumerate(MODELS)}
    effort_order = {
        effort: position
        for position, effort in enumerate((*BASE_EFFORTS, HIGH_EFFORT))
    }
    ordered = sorted(
        all_cases,
        key=lambda config: (
            model_order.get(config[0], 99),
            effort_order.get(config[1], 99),
            config,
        ),
    )
    comparisons: list[dict[str, Any]] = []
    for left_index, left in enumerate(ordered):
        for right in ordered[left_index + 1 :]:
            expected_common = all_cases[left] & all_cases[right]
            left_scored = configs.get(left, {})
            right_scored = configs.get(right, {})
            common = sorted(expected_common & set(left_scored) & set(right_scored))
            left_wins = ties = right_wins = 0
            quality_deltas: list[float] = []
            strict_deltas: list[float] = []
            for fingerprint in common:
                left_row = left_scored[fingerprint]
                right_row = right_scored[fingerprint]
                left_strict = float(left_row.get("strictPass") or 0.0)
                right_strict = float(right_row.get("strictPass") or 0.0)
                strict_delta = left_strict - right_strict
                quality_delta = float(left_row["quality"]) - float(right_row["quality"])
                strict_deltas.append(strict_delta)
                quality_deltas.append(quality_delta)
                if strict_delta > 0:
                    left_wins += 1
                elif strict_delta < 0:
                    right_wins += 1
                elif quality_delta > PAIR_TIE_EPSILON:
                    left_wins += 1
                elif quality_delta < -PAIR_TIE_EPSILON:
                    right_wins += 1
                else:
                    ties += 1
            comparisons.append(
                {
                    "left": {"model": left[0], "reasoningEffort": left[1]},
                    "right": {"model": right[0], "reasoningEffort": right[1]},
                    "expectedCommonCases": len(expected_common),
                    "pairedCases": len(common),
                    "eligibleForSelection": (
                        len(common) >= PAIR_MIN_CASES
                        and len(common) == len(expected_common)
                    ),
                    "leftWins": left_wins,
                    "ties": ties,
                    "rightWins": right_wins,
                    "meanStrictPassDeltaLeftMinusRight": (
                        statistics.fmean(strict_deltas) if strict_deltas else None
                    ),
                    "meanQualityDeltaLeftMinusRight": (
                        statistics.fmean(quality_deltas) if quality_deltas else None
                    ),
                }
            )
    return {
        "decisionRule": (
            "strictPass first; then quality with +/-0.5 point tie band; "
            "only identical case fingerprints with numeric quality"
        ),
        "automaticWinner": False,
        "minimumPairedCases": PAIR_MIN_CASES,
        "requiresCompleteNumericPairing": True,
        "qualityTieEpsilon": PAIR_TIE_EPSILON,
        "comparisons": comparisons,
    }


def _result_key(result: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(result.get("caseFingerprint", "")),
        str(result.get("model", "")),
        str(result.get("reasoningEffort", "")),
    )


def _result_sort_key(result: dict[str, Any]) -> tuple[int, int, str]:
    return (
        MODELS.index(result["model"])
        if result.get("model") in MODELS
        else len(MODELS),
        (*BASE_EFFORTS, HIGH_EFFORT).index(result["reasoningEffort"])
        if result.get("reasoningEffort") in (*BASE_EFFORTS, HIGH_EFFORT)
        else 99,
        str(result.get("caseId", "")),
    )


def load_resume_results(
    output: Path,
    *,
    evaluation_fingerprint: str,
    restart: bool,
) -> tuple[str, dict[tuple[str, str, str], dict[str, Any]]]:
    if restart or not output.exists():
        return utc_now(), {}
    if output.is_symlink() or not output.is_file():
        raise EvalPreflightError("existing output must be a regular non-symlink file")
    try:
        if output.stat().st_size > 32 * 1024 * 1024:
            raise EvalPreflightError("existing eval output is unexpectedly large")
        value = json.loads(output.read_text(encoding="utf-8"))
    except EvalPreflightError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise EvalPreflightError("existing eval output is not valid JSON") from error
    if (
        not isinstance(value, dict)
        or value.get("formatVersion") != FORMAT_VERSION
        or value.get("evaluationFingerprint") != evaluation_fingerprint
        or not isinstance(value.get("results"), list)
    ):
        raise EvalPreflightError(
            "existing output belongs to another fixture or contract; "
            "choose a new --output or use --restart"
        )
    results: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in value["results"]:
        if not isinstance(row, dict):
            raise EvalPreflightError("existing eval output contains an invalid result")
        key = _result_key(row)
        if (
            not all(key)
            or row.get("model") not in MODELS
            or row.get("reasoningEffort") not in (*BASE_EFFORTS, HIGH_EFFORT)
            or row.get("status") not in {"ok", "error"}
            or key in results
        ):
            raise EvalPreflightError("existing eval output contains an invalid result")
        results[key] = row
    created_at = value.get("createdAt")
    return (created_at if isinstance(created_at, str) else utc_now()), results


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.is_symlink():
        raise EvalPreflightError("output path cannot be a symlink")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            descriptor = -1
            json.dump(value, stream, indent=2, ensure_ascii=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def build_schedule(
    cases: list[PreparedCase],
    available_models: Iterable[str],
    high_models: Iterable[str],
) -> tuple[list[tuple[PreparedCase, str, str]], list[dict[str, str]]]:
    available_set = set(available_models)
    available = [model for model in MODELS if model in available_set]
    requested_high = list(dict.fromkeys(high_models))
    schedule: list[tuple[PreparedCase, str, str]] = []
    skipped: list[dict[str, str]] = []
    for model in MODELS:
        if model not in available:
            for effort in BASE_EFFORTS:
                skipped.append(
                    {
                        "model": model,
                        "reasoningEffort": effort,
                        "reason": "not_in_account_catalog",
                    }
                )
    if available:
        for case_index, case in enumerate(cases):
            offset = case_index % len(available)
            rotated = available[offset:] + available[:offset]
            effort_order = (
                BASE_EFFORTS
                if case_index % 2 == 0
                else tuple(reversed(BASE_EFFORTS))
            )
            for effort in effort_order:
                schedule.extend((case, model, effort) for model in rotated)
    available_high: list[str] = []
    for model in requested_high:
        if model not in available:
            skipped.append(
                {
                    "model": model,
                    "reasoningEffort": HIGH_EFFORT,
                    "reason": "not_in_account_catalog",
                }
            )
            continue
        available_high.append(model)
    for case_index, case in enumerate(cases):
        if not available_high:
            break
        offset = case_index % len(available_high)
        rotated = available_high[offset:] + available_high[:offset]
        schedule.extend((case, model, HIGH_EFFORT) for model in rotated)
    return schedule, skipped


def contract_fingerprint(
    cases: list[PreparedCase],
    *,
    prompt_builder: Callable[[Any], Any],
    selection_schema: dict[str, Any],
    public_output_schema: dict[str, Any],
    renderer_material: dict[str, Any],
    base_instructions: str,
) -> tuple[str, str]:
    contract = sha256_bytes(
        canonical_json(
            {
                "baseInstructions": base_instructions,
                "prompts": sorted(
                    [
                        {
                            "instructions": prompt_builder(case.snapshot).instructions,
                            "userInput": prompt_builder(case.snapshot).user_input,
                        }
                        for case in cases
                    ],
                    key=canonical_json,
                ),
                "provider": "OpenAISubscriptionProvider.select_insights",
                "selectionSchema": selection_schema,
                "publicOutputSchema": public_output_schema,
                "renderer": renderer_material,
                "scoringVersion": SCORING_VERSION,
            }
        )
    )
    evaluation = sha256_bytes(
        str(FORMAT_VERSION).encode("ascii"),
        contract.encode("ascii"),
        *(case.fingerprint.encode("ascii") for case in cases),
    )
    return contract, evaluation


async def provider_preflight(
    service: Any,
    *,
    transient_retries: int,
    retry_base_seconds: float,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        account, account_attempts = await call_with_retry(
            service.account_status,
            transient_retries=transient_retries,
            retry_base_seconds=retry_base_seconds,
        )
        if not isinstance(account, dict) or account.get("connected") is not True:
            raise EvalPreflightError("ChatGPT subscription is not connected")
        catalog, catalog_attempts = await call_with_retry(
            service.list_models,
            transient_retries=transient_retries,
            retry_base_seconds=retry_base_seconds,
        )
    except ClassifiedCallError as error:
        suffix = f", HTTP {error.info.status_code}" if error.info.status_code else ""
        raise EvalPreflightError(
            f"provider preflight failed: {error.info.category}{suffix}"
        ) from error
    if not isinstance(catalog, list):
        raise EvalPreflightError("provider returned an invalid model catalog")
    return (
        {
            "connected": True,
            "accountStatusAttempts": account_attempts,
            "catalogAttempts": catalog_attempts,
        },
        catalog,
    )


def build_output(
    *,
    created_at: str,
    evaluation_fingerprint: str,
    contract_hash: str,
    cases: list[PreparedCase],
    provider: dict[str, Any],
    available_models: list[str],
    high_models: list[str],
    skipped: list[dict[str, str]],
    scheduled_keys: set[tuple[str, str, str]],
    results: dict[tuple[str, str, str], dict[str, Any]],
) -> dict[str, Any]:
    active_results = {
        key: row for key, row in results.items() if key in scheduled_keys
    }
    rows = sorted(active_results.values(), key=_result_sort_key)
    completed = len(scheduled_keys.intersection(results))
    return {
        "formatVersion": FORMAT_VERSION,
        "createdAt": created_at,
        "updatedAt": utc_now(),
        "state": "complete" if completed == len(scheduled_keys) else "running",
        "evaluationFingerprint": evaluation_fingerprint,
        "contractFingerprint": contract_hash,
        "fixtures": {
            "synthetic": True,
            "cases": len(cases),
            "locales": sorted({case.snapshot.locale for case in cases}),
            "fingerprint": sha256_bytes(
                *(case.fingerprint.encode("ascii") for case in cases)
            ),
        },
        "provider": provider,
        "matrix": {
            "baseReasoningEfforts": list(BASE_EFFORTS),
            "requestedHighModels": high_models,
            "availableModels": available_models,
            "scheduledCalls": len(scheduled_keys),
            "completedCalls": completed,
            "skippedConfigurations": skipped,
        },
        "summary": aggregate(rows),
        "paired": paired_comparisons(rows, scheduled_keys),
        "results": rows,
    }


async def run(args: argparse.Namespace) -> None:
    requested_high = list(dict.fromkeys(args.high_model))
    if not (args.run and args.accept_subscription_usage):
        print(
            json.dumps(
                {
                    "mode": "plan-only",
                    "models": list(MODELS),
                    "baseReasoningEfforts": list(BASE_EFFORTS),
                    "requestedHighModels": requested_high,
                    "fixtures": str(args.fixtures),
                    "metrics": ["schemaValidity", *SUMMARY_METRICS, "quality", "latencyMs"],
                    "note": (
                        "No fixture, credential, backend dependency, or provider was read. "
                        "Pass --run --accept-subscription-usage to start the eval."
                    ),
                },
                indent=2,
            )
        )
        return

    # Cost-bearing dependencies and credentials are reached only after both gates.
    from app.config import get_settings
    from app.providers.common import (
        BASE_INSTRUCTIONS,
        build_insight_prompt,
        insight_prompt_data,
        schema_for,
        strict_json_schema,
    )
    from app.providers.openai_subscription import OpenAISubscriptionProvider
    from app.schemas.ai import (
        GeneratedInsights,
        GroundedInsightSelection,
        InsightSnapshot,
    )
    from app.services.grounded_insights import (
        grounded_insight_renderer_fingerprint_material,
        render_grounded_insights,
    )
    from app.services.openai_codex import OpenAICodexService

    settings = get_settings()
    cases = validate_fixtures(
        args.fixtures,
        snapshot_type=InsightSnapshot,
        prompt_data_builder=insight_prompt_data,
    )
    output_path = args.output.expanduser().resolve(strict=False)
    fixture_path = args.fixtures.expanduser().resolve(strict=True)
    if output_path == fixture_path:
        raise EvalPreflightError("output path cannot overwrite the fixture input")
    args.output = output_path
    selection_schema = strict_json_schema(schema_for(GroundedInsightSelection))
    public_output_schema = schema_for(GeneratedInsights)
    contract_hash, evaluation_fingerprint = contract_fingerprint(
        cases,
        prompt_builder=build_insight_prompt,
        selection_schema=selection_schema,
        public_output_schema=public_output_schema,
        renderer_material=grounded_insight_renderer_fingerprint_material(),
        base_instructions=BASE_INSTRUCTIONS,
    )
    created_at, results = load_resume_results(
        args.output,
        evaluation_fingerprint=evaluation_fingerprint,
        restart=args.restart,
    )
    service = OpenAICodexService(settings)
    try:
        provider_state, catalog = await provider_preflight(
            service,
            transient_retries=args.transient_retries,
            retry_base_seconds=args.retry_base_seconds,
        )
        catalog_ids = {
            entry.get("id")
            for entry in catalog
            if isinstance(entry, dict) and isinstance(entry.get("id"), str)
        }
        available_models = [model for model in MODELS if model in catalog_ids]
        if not available_models:
            raise EvalPreflightError(
                "none of the GPT-5.6 eval models is in the account catalog"
            )
        schedule, skipped = build_schedule(cases, available_models, requested_high)
        scheduled_keys = {
            (case.fingerprint, model, effort)
            for case, model, effort in schedule
        }
        if args.rerun_failures:
            for key in list(results):
                if key in scheduled_keys and results[key].get("status") == "error":
                    del results[key]

        def checkpoint() -> None:
            atomic_write_json(
                args.output,
                build_output(
                    created_at=created_at,
                    evaluation_fingerprint=evaluation_fingerprint,
                    contract_hash=contract_hash,
                    cases=cases,
                    provider=provider_state,
                    available_models=available_models,
                    high_models=requested_high,
                    skipped=skipped,
                    scheduled_keys=scheduled_keys,
                    results=results,
                ),
            )

        checkpoint()
        for case, model, effort in schedule:
            key = (case.fingerprint, model, effort)
            if key not in scheduled_keys or key in results:
                continue
            started = time.perf_counter()
            adapter = OpenAISubscriptionProvider(
                model,
                service,
                reasoning_effort=effort,
            )

            async def operation() -> Any:
                return await adapter.select_insights(case.snapshot)

            try:
                selected, attempts = await call_with_retry(
                    operation,
                    transient_retries=args.transient_retries,
                    retry_base_seconds=args.retry_base_seconds,
                )
                selection_scores = score_selection(case, selected)
                try:
                    rendered_output = _plain_model(
                        render_grounded_insights(case.snapshot, selected)
                    )
                    renderer_valid = True
                except ValueError:
                    # Keep the model decision for diagnosis/scoring. Production
                    # would reject this selection before returning public prose.
                    rendered_output = None
                    renderer_valid = False
                result: dict[str, Any] = {
                    "status": "ok",
                    "attempts": attempts,
                    "selection": _plain_selection(selected),
                    # Human review evaluates only this deterministic renderer
                    # output; automated model scoring evaluates the selection.
                    "output": rendered_output,
                    "rendererValid": renderer_valid,
                    **selection_scores,
                }
            except ClassifiedCallError as error:
                counts = error.info.category in MODEL_QUALITY_ERROR_CATEGORIES
                result = {
                    "status": "error",
                    "attempts": error.attempts,
                    "error": {
                        "category": error.info.category,
                        "type": (
                            type(error.__cause__).__name__ if error.__cause__ else None
                        ),
                        "statusCode": error.info.status_code,
                        "retryable": error.info.retryable,
                    },
                    **failure_metrics(counts_against_quality=counts),
                }
            result.update(
                {
                    "model": model,
                    "reasoningEffort": effort,
                    "caseId": case.case_id,
                    "locale": case.snapshot.locale,
                    "caseFingerprint": case.fingerprint,
                    "latencyMs": round((time.perf_counter() - started) * 1000),
                    "completedAt": utc_now(),
                }
            )
            results[key] = result
            checkpoint()
            if result["status"] != "error":
                continue
            category = result["error"]["category"]
            if category in {"authentication", "configuration", "unexpected"}:
                raise EvalPreflightError(
                    f"eval stopped after global failure: {category}; "
                    "resume the checkpoint after correction"
                )
            if category in {"model_unavailable", "request_rejected"}:
                for pending_case, pending_model, pending_effort in schedule:
                    if (pending_model, pending_effort) == (model, effort):
                        scheduled_keys.discard(
                            (pending_case.fingerprint, pending_model, pending_effort)
                        )
                scheduled_keys.add(key)
                skipped.append(
                    {
                        "model": model,
                        "reasoningEffort": effort,
                        "reason": category,
                    }
                )
                checkpoint()
    finally:
        await service.close()
    print(args.output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--fixtures",
        type=Path,
        default=ROOT / "dataset/gpt56_insight_fixtures.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "dataset/results/gpt56-insights.json",
    )
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--accept-subscription-usage", action="store_true")
    parser.add_argument(
        "--high-model",
        action="append",
        choices=MODELS,
        default=[],
        help="add a selective high-effort round for this catalog model",
    )
    parser.add_argument("--transient-retries", type=int, default=1)
    parser.add_argument("--retry-base-seconds", type=float, default=2.0)
    parser.add_argument("--restart", action="store_true")
    parser.add_argument("--rerun-failures", action="store_true")
    args = parser.parse_args()
    if args.run != args.accept_subscription_usage:
        parser.error("model calls require both --run and --accept-subscription-usage")
    if not 0 <= args.transient_retries <= 3:
        parser.error("--transient-retries must be between 0 and 3")
    if not 0 <= args.retry_base_seconds <= 30:
        parser.error("--retry-base-seconds must be between 0 and 30")
    try:
        asyncio.run(run(args))
    except EvalPreflightError as error:
        parser.exit(2, f"error: {error}\n")


if __name__ == "__main__":
    main()
