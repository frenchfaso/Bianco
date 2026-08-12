#!/usr/bin/env python3
"""Plan or run the GPT-5.6 receipt eval through Bianco's subscription provider.

Plan mode is dependency-free and never reads credentials or contacts OpenAI. Model
calls require both ``--run`` and ``--accept-subscription-usage``. A real run first
validates the complete dataset, then checks the connected account and live model
catalog before it spends subscription allowance.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import statistics
import sys
import tempfile
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable


ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
if str(SERVER) not in sys.path:
    sys.path.insert(0, str(SERVER))

FORMAT_VERSION = 3
SCORING_VERSION = "receipt-score-v3-null-penalty-global-match"
MODELS = ("gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna")
BASE_EFFORTS = ("low", "medium")
HIGH_EFFORT = "high"
ALLOWED_CATEGORY_IDS = frozenset({
    "food_grocery",
    "restaurant",
    "transport",
    "home",
    "health",
    "personal",
    "entertainment",
    "other",
})
MAX_LABEL_BYTES = 16 * 1024 * 1024
MAX_CASES = 1_000

HEADER_METRICS = (
    ("transaction_date", "transactionDateExact"),
    ("currency", "currencyExact"),
    ("subtotal_minor", "subtotalExact"),
    ("tax_minor", "taxExact"),
    ("discount_minor", "discountExact"),
)
QUALITY_WEIGHTS = {
    "merchantSimilarity": 0.10,
    "headerExact": 0.20,
    "totalExact": 0.25,
    "itemRecall": 0.10,
    "itemPrecision": 0.05,
    "itemNameSimilarity": 0.10,
    "itemPriceExact": 0.15,
    "itemCategoryExact": 0.05,
}
SUMMARY_METRICS = (
    "merchantSimilarity",
    "headerExact",
    "transactionDateExact",
    "currencyExact",
    "subtotalExact",
    "taxExact",
    "discountExact",
    "totalExact",
    "itemRecall",
    "itemPrecision",
    "itemNameSimilarity",
    "itemPriceExact",
    "itemUnitPriceExact",
    "itemQuantityExact",
    "itemCategoryExact",
)
MODEL_QUALITY_ERROR_CATEGORIES = frozenset({
    "structured_output",
})


class EvalPreflightError(RuntimeError):
    """A safe-to-display error detected before or outside model evaluation."""


@dataclass(frozen=True)
class PreparedCase:
    case_id: str
    image_path: Path
    image_sha256: str
    image_size: int
    mime_type: str
    context: Any
    expected: Any
    fingerprint: str


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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require_canonical_fields(raw: dict[str, Any], model: Any, label: str) -> None:
    canonical = model.model_dump(mode="json", by_alias=True)
    missing = sorted(set(canonical) - set(raw))
    if missing:
        raise EvalPreflightError(
            f"{label} is missing canonical fields: {', '.join(missing)}"
        )


def _safe_image_path(image_root: Path, raw_path: Any, index: int) -> tuple[str, Path]:
    if not isinstance(raw_path, str) or not raw_path or len(raw_path) > 512:
        raise EvalPreflightError(f"case {index}: image must be a non-empty relative path")
    if "\\" in raw_path or "\0" in raw_path:
        raise EvalPreflightError(f"case {index}: image path contains unsupported characters")
    relative = Path(raw_path)
    if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
        raise EvalPreflightError(f"case {index}: image must stay inside the dataset")

    candidate = image_root / relative
    cursor = image_root
    for part in relative.parts:
        cursor /= part
        if cursor.is_symlink():
            raise EvalPreflightError(f"case {index}: image path cannot contain symlinks")
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(image_root)
    except (FileNotFoundError, OSError, ValueError) as error:
        raise EvalPreflightError(f"case {index}: image is missing or outside the dataset") from error
    if not resolved.is_file():
        raise EvalPreflightError(f"case {index}: image is not a regular file")
    return relative.as_posix(), resolved


def validate_dataset(
    dataset: Path,
    *,
    image_root: Path | None = None,
    extraction_context_type: Any,
    receipt_extraction_type: Any,
    image_module: Any,
    max_image_bytes: int,
    max_image_pixels: int,
    max_image_dimension: int,
) -> list[PreparedCase]:
    """Validate every label and image before the provider is contacted."""

    raw_dataset = dataset.expanduser()
    if raw_dataset.is_symlink():
        raise EvalPreflightError("dataset directory cannot be a symlink")
    try:
        dataset = raw_dataset.resolve(strict=True)
    except (FileNotFoundError, OSError) as error:
        raise EvalPreflightError("dataset directory does not exist") from error
    if not dataset.is_dir():
        raise EvalPreflightError("dataset path is not a directory")

    raw_image_root = (image_root or dataset).expanduser()
    if raw_image_root.is_symlink():
        raise EvalPreflightError("image root cannot be a symlink")
    try:
        image_root = raw_image_root.resolve(strict=True)
    except (FileNotFoundError, OSError) as error:
        raise EvalPreflightError("image root directory does not exist") from error
    if not image_root.is_dir():
        raise EvalPreflightError("image root path is not a directory")

    labels_path = dataset / "labels.json"
    if labels_path.is_symlink() or not labels_path.is_file():
        raise EvalPreflightError("labels.json must be a regular non-symlink file")
    try:
        label_size = labels_path.stat().st_size
    except OSError as error:
        raise EvalPreflightError("labels.json cannot be inspected") from error
    if not 1 <= label_size <= MAX_LABEL_BYTES:
        raise EvalPreflightError("labels.json has an invalid size")
    try:
        labels = json.loads(labels_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise EvalPreflightError("labels.json is not valid UTF-8 JSON") from error
    if not isinstance(labels, list) or not 1 <= len(labels) <= MAX_CASES:
        raise EvalPreflightError(f"labels.json must contain 1 to {MAX_CASES} cases")

    prepared: list[PreparedCase] = []
    seen_images: set[str] = set()
    allowed_case_fields = {"image", "context", "expected"}
    format_mimes = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}

    for index, raw_case in enumerate(labels):
        if not isinstance(raw_case, dict):
            raise EvalPreflightError(f"case {index}: entry must be an object")
        unknown = sorted(set(raw_case) - allowed_case_fields)
        missing = sorted(allowed_case_fields - set(raw_case))
        if unknown or missing:
            detail = []
            if missing:
                detail.append(f"missing {', '.join(missing)}")
            if unknown:
                detail.append(f"unknown {', '.join(unknown)}")
            raise EvalPreflightError(f"case {index}: {'; '.join(detail)}")

        case_id, image_path = _safe_image_path(image_root, raw_case["image"], index)
        if case_id in seen_images:
            raise EvalPreflightError(f"case {index}: duplicate image reference")
        seen_images.add(case_id)

        try:
            image_size = image_path.stat().st_size
        except OSError as error:
            raise EvalPreflightError(f"case {index}: image cannot be inspected") from error
        if not 1 <= image_size <= max_image_bytes:
            raise EvalPreflightError(f"case {index}: image exceeds the configured byte limit")
        try:
            with image_module.open(image_path) as image:
                image_format = str(image.format or "").upper()
                width, height = image.size
                if image_format not in format_mimes:
                    raise EvalPreflightError(f"case {index}: unsupported image format")
                if (
                    width < 1
                    or height < 1
                    or max(width, height) > max_image_dimension
                    or width * height > max_image_pixels
                ):
                    raise EvalPreflightError(f"case {index}: image dimensions exceed limits")
                image.verify()
        except EvalPreflightError:
            raise
        except (OSError, ValueError) as error:
            raise EvalPreflightError(f"case {index}: image is corrupt") from error

        raw_context = raw_case["context"]
        raw_expected = raw_case["expected"]
        if not isinstance(raw_context, dict) or not isinstance(raw_expected, dict):
            raise EvalPreflightError(f"case {index}: context and expected must be objects")
        try:
            context = extraction_context_type.model_validate(raw_context)
            expected = receipt_extraction_type.model_validate(raw_expected)
        except Exception as error:
            if type(error).__name__ != "ValidationError":
                raise
            raise EvalPreflightError(f"case {index}: label schema is invalid") from error

        _require_canonical_fields(raw_expected, expected, f"case {index}: expected")
        if not isinstance(raw_expected.get("merchant"), dict):
            raise EvalPreflightError(f"case {index}: expected.merchant must be an object")
        _require_canonical_fields(
            raw_expected["merchant"], expected.merchant, f"case {index}: expected.merchant"
        )
        if not isinstance(raw_expected.get("items"), list):
            raise EvalPreflightError(f"case {index}: expected.items must be an array")
        for item_index, (raw_item, item) in enumerate(zip(raw_expected["items"], expected.items)):
            if not isinstance(raw_item, dict):
                raise EvalPreflightError(
                    f"case {index}: expected.items[{item_index}] must be an object"
                )
            _require_canonical_fields(
                raw_item, item, f"case {index}: expected.items[{item_index}]"
            )
            if not normalized_text(item.raw_name) and not normalized_text(item.normalized_name):
                raise EvalPreflightError(
                    f"case {index}: expected.items[{item_index}] needs a readable name"
                )
            if item.category_id not in ALLOWED_CATEGORY_IDS:
                raise EvalPreflightError(
                    f"case {index}: expected.items[{item_index}] has an unknown category"
                )
        if expected.category_id not in ALLOWED_CATEGORY_IDS:
            raise EvalPreflightError(f"case {index}: expected has an unknown category")
        if expected.currency != context.currency:
            raise EvalPreflightError(f"case {index}: context and expected currency differ")

        image_sha256 = sha256_file(image_path)
        serialized_context = context.model_dump(mode="json", by_alias=True)
        serialized_expected = expected.model_dump(mode="json", by_alias=True)
        fingerprint = sha256_bytes(
            case_id.encode("utf-8"),
            image_sha256.encode("ascii"),
            canonical_json(serialized_context),
            canonical_json(serialized_expected),
        )
        prepared.append(PreparedCase(
            case_id=case_id,
            image_path=image_path,
            image_sha256=image_sha256,
            image_size=image_size,
            mime_type=format_mimes[image_format],
            context=context,
            expected=expected,
            fingerprint=fingerprint,
        ))
    return prepared


def read_prevalidated_image(case: PreparedCase) -> bytes:
    try:
        content = case.image_path.read_bytes()
    except OSError as error:
        raise EvalPreflightError(f"dataset image changed after preflight: {case.case_id}") from error
    if len(content) != case.image_size or hashlib.sha256(content).hexdigest() != case.image_sha256:
        raise EvalPreflightError(f"dataset image changed after preflight: {case.case_id}")
    return content


def normalized_text(value: str | None) -> str:
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join("".join(char if char.isalnum() else " " for char in plain).split())


def text_similarity(left: str | None, right: str | None) -> float:
    a, b = normalized_text(left), normalized_text(right)
    if not a or not b:
        # Missing names carry no matching evidence. In particular, two default
        # empty normalized names must not make unrelated item rows a perfect pair.
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def merchant_similarity(expected: Any, actual: Any) -> float | None:
    expected_names = [
        value for value in (expected.merchant.raw_name, expected.merchant.normalized_name)
        if normalized_text(value)
    ]
    if not expected_names:
        return None
    actual_names = (actual.merchant.raw_name, actual.merchant.normalized_name)
    return max(text_similarity(left, right) for left in expected_names for right in actual_names)


def item_name_similarity(expected: Any, actual: Any) -> float:
    return max(
        text_similarity(expected.raw_name, actual.raw_name),
        text_similarity(expected.raw_name, actual.normalized_name),
        text_similarity(expected.normalized_name, actual.raw_name),
        text_similarity(expected.normalized_name, actual.normalized_name),
    )


def match_items(expected_items: list[Any], actual_items: list[Any]) -> list[tuple[int, int]]:
    """Globally match lines by names only; scored amounts never affect pairing.

    This is the O(n^3) Hungarian algorithm over a square, zero-padded matrix.
    Similarities below the acceptance threshold have zero weight, so they cannot
    consume a line that belongs to a stronger admissible match.
    """

    size = max(len(expected_items), len(actual_items))
    if not size:
        return []
    weights = [[0.0] * size for _ in range(size)]
    for expected_index, expected in enumerate(expected_items):
        for actual_index, actual in enumerate(actual_items):
            similarity = item_name_similarity(expected, actual)
            if similarity >= 0.45:
                weights[expected_index][actual_index] = similarity

    # Potentials-based Hungarian algorithm for minimum cost assignment. Negating
    # the name similarity turns maximum-weight matching into minimization.
    row_potential = [0.0] * (size + 1)
    column_potential = [0.0] * (size + 1)
    matched_row = [0] * (size + 1)
    predecessor = [0] * (size + 1)
    for row in range(1, size + 1):
        matched_row[0] = row
        minimum = [float("inf")] * (size + 1)
        used = [False] * (size + 1)
        column = 0
        while True:
            used[column] = True
            current_row = matched_row[column]
            delta = float("inf")
            next_column = 0
            for candidate_column in range(1, size + 1):
                if used[candidate_column]:
                    continue
                reduced_cost = (
                    -weights[current_row - 1][candidate_column - 1]
                    - row_potential[current_row]
                    - column_potential[candidate_column]
                )
                if reduced_cost < minimum[candidate_column]:
                    minimum[candidate_column] = reduced_cost
                    predecessor[candidate_column] = column
                if minimum[candidate_column] < delta:
                    delta = minimum[candidate_column]
                    next_column = candidate_column
            for candidate_column in range(size + 1):
                if used[candidate_column]:
                    row_potential[matched_row[candidate_column]] += delta
                    column_potential[candidate_column] -= delta
                else:
                    minimum[candidate_column] -= delta
            column = next_column
            if matched_row[column] == 0:
                break
        while True:
            previous_column = predecessor[column]
            matched_row[column] = matched_row[previous_column]
            column = previous_column
            if column == 0:
                break

    assigned_column = [0] * (size + 1)
    for column in range(1, size + 1):
        assigned_column[matched_row[column]] = column
    return [
        (row - 1, assigned_column[row] - 1)
        for row in range(1, len(expected_items) + 1)
        if assigned_column[row] <= len(actual_items)
        and weights[row - 1][assigned_column[row] - 1] > 0.0
    ]


def ratio(correct: int | float, total: int) -> float:
    return float(correct) / total if total else 1.0


def _optional_exact(expected: Any, actual: Any) -> float | None:
    # A labelled absence is evidence too: inventing an unreadable/unprinted
    # field must be penalized, while returning null earns the exact match.
    return float(expected == actual)


def _weighted_quality(metrics: dict[str, float | None]) -> float:
    applicable = [
        (QUALITY_WEIGHTS[name], metrics.get(name))
        for name in QUALITY_WEIGHTS
        if metrics.get(name) is not None
    ]
    denominator = sum(weight for weight, _value in applicable)
    if not denominator:
        return 0.0
    return 100 * sum(weight * float(value) for weight, value in applicable) / denominator


def score(expected: Any, actual: Any) -> dict[str, float | None]:
    matches = match_items(expected.items, actual.items)
    match_by_expected = {expected_index: actual_index for expected_index, actual_index in matches}

    header_values = {
        metric_name: _optional_exact(
            getattr(expected, field_name), getattr(actual, field_name)
        )
        for field_name, metric_name in HEADER_METRICS
    }
    applicable_header = [value for value in header_values.values() if value is not None]
    header_exact = statistics.fmean(applicable_header) if applicable_header else None

    expected_count = len(expected.items)
    actual_count = len(actual.items)
    item_recall = (
        ratio(len(matches), expected_count)
        if expected_count
        else float(not actual_count)
    )
    item_precision = (
        ratio(len(matches), actual_count)
        if actual_count
        else float(not expected_count)
    )

    if expected_count:
        name_total = sum(
            item_name_similarity(expected.items[expected_index], actual.items[actual_index])
            for expected_index, actual_index in matches
        )
        item_names: float | None = ratio(name_total, expected_count)
        item_categories: float | None = ratio(
            sum(
                expected.items[expected_index].category_id
                == actual.items[actual_index].category_id
                for expected_index, actual_index in matches
            ),
            expected_count,
        )
    else:
        item_names = None
        item_categories = None

    def exact_item_metric(field: str) -> float | None:
        if not expected.items:
            return None
        correct = 0
        for expected_index, expected_item in enumerate(expected.items):
            actual_index = match_by_expected.get(expected_index)
            if actual_index is not None:
                correct += int(
                    getattr(expected_item, field)
                    == getattr(actual.items[actual_index], field)
                )
        return ratio(correct, len(expected.items))

    metrics: dict[str, float | None] = {
        "schemaValidity": 1.0,
        "merchantSimilarity": merchant_similarity(expected, actual),
        "headerExact": header_exact,
        **header_values,
        "totalExact": _optional_exact(expected.total_minor, actual.total_minor),
        "itemRecall": item_recall,
        "itemPrecision": item_precision,
        "itemNameSimilarity": item_names,
        "itemPriceExact": exact_item_metric("total_price_minor"),
        "itemUnitPriceExact": exact_item_metric("unit_price_minor"),
        "itemQuantityExact": exact_item_metric("quantity"),
        "itemCategoryExact": item_categories,
    }
    metrics["quality"] = _weighted_quality(metrics)
    return metrics


def failure_metrics(expected: Any, *, counts_against_quality: bool) -> dict[str, float | None]:
    if not counts_against_quality:
        return {
            "schemaValidity": None,
            **{name: None for name in SUMMARY_METRICS},
            "quality": None,
        }

    # A structured-output failure produced no usable prediction. Every header
    # field and every field of a labelled item therefore receives an effective
    # zero, including labels whose correct value was null.
    header_values = {metric_name: 0.0 for _field_name, metric_name in HEADER_METRICS}
    has_items = bool(expected.items)
    metrics: dict[str, float | None] = {
        "schemaValidity": 0.0,
        "merchantSimilarity": 0.0
        if normalized_text(expected.merchant.raw_name)
        or normalized_text(expected.merchant.normalized_name)
        else None,
        "headerExact": 0.0,
        **header_values,
        "totalExact": 0.0,
        "itemRecall": 0.0,
        "itemPrecision": 0.0,
        "itemNameSimilarity": 0.0 if has_items else None,
        "itemPriceExact": 0.0 if has_items else None,
        "itemUnitPriceExact": 0.0 if has_items else None,
        "itemQuantityExact": 0.0 if has_items else None,
        "itemCategoryExact": 0.0 if has_items else None,
    }
    metrics["quality"] = 0.0
    return metrics


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
        "CloseError",
        "RemoteProtocolError",
    }:
        return ErrorInfo("transport", True)
    if error_type in {"ValidationError", "JSONDecodeError"}:
        return ErrorInfo("structured_output", False)
    if isinstance(error, ValueError):
        message = str(error)
        if "Provider returned" in message or "JSON" in message:
            return ErrorInfo("structured_output", False)
        return ErrorInfo("configuration", False)
    if isinstance(error, OSError):
        return ErrorInfo("local_io", False)
    if isinstance(error, RuntimeError):
        message = str(error).casefold()
        if any(fragment in message for fragment in (
            "stream event",
            "structured response",
            "oversized output",
            "could not complete",
            "no completed",
        )):
            return ErrorInfo("provider_response", False)
        if "credential" in message or "subscription" in message:
            return ErrorInfo("authentication", False)
        return ErrorInfo("provider_response", False)
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
            delay = _retry_after_seconds(
                error, retry_base_seconds * (2 ** (attempts - 1))
            )
            await sleep(delay)


def aggregate(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for result in results:
        groups.setdefault((result["model"], result["reasoningEffort"]), []).append(result)

    summaries: list[dict[str, Any]] = []
    effort_order = {effort: position for position, effort in enumerate((*BASE_EFFORTS, HIGH_EFFORT))}
    model_order = {model: position for position, model in enumerate(MODELS)}
    for (model, effort), rows in sorted(
        groups.items(),
        key=lambda group: (
            model_order.get(group[0][0], len(model_order)),
            effort_order.get(group[0][1], len(effort_order)),
        ),
    ):
        latencies = sorted(
            row["latencyMs"] for row in rows
            if isinstance(row.get("latencyMs"), (int, float))
        )
        p95_index = max(0, min(len(latencies) - 1, (95 * len(latencies) + 99) // 100 - 1))
        successful = [row for row in rows if row.get("status") == "ok"]
        schema_responses = [
            row for row in rows if isinstance(row.get("schemaValidity"), (int, float))
        ]
        quality_rows = [
            float(row["quality"]) for row in rows
            if isinstance(row.get("quality"), (int, float))
        ]
        valid_quality = [float(row["quality"]) for row in successful]
        error_counts: dict[str, int] = {}
        for row in rows:
            category = (row.get("error") or {}).get("category")
            if isinstance(category, str):
                error_counts[category] = error_counts.get(category, 0) + 1

        metric_summary: dict[str, dict[str, float | int | None]] = {}
        for name in SUMMARY_METRICS:
            scored = [
                float(row[name]) for row in rows
                if isinstance(row.get(name), (int, float))
            ]
            valid_scored = [
                float(row[name]) for row in successful
                if isinstance(row.get(name), (int, float))
            ]
            metric_summary[name] = {
                "scoredCases": len(scored),
                "effectiveMean": statistics.fmean(scored) if scored else None,
                "meanOnValid": statistics.fmean(valid_scored) if valid_scored else None,
            }

        summaries.append({
            "model": model,
            "reasoningEffort": effort,
            "cases": len(rows),
            "successfulCases": len(successful),
            "successRate": len(successful) / len(rows),
            "schemaResponses": len(schema_responses),
            "schemaValidRate": (
                sum(row["schemaValidity"] == 1.0 for row in schema_responses)
                / len(schema_responses)
                if schema_responses else None
            ),
            "qualityScoredCases": len(quality_rows),
            "effectiveQuality": statistics.fmean(quality_rows) if quality_rows else None,
            "meanQualityOnValid": statistics.fmean(valid_quality) if valid_quality else None,
            "meanAttempts": statistics.fmean(row.get("attempts", 1) for row in rows),
            "meanLatencyMs": round(statistics.fmean(latencies)) if latencies else None,
            "p95LatencyMs": latencies[p95_index] if latencies else None,
            "errorCounts": dict(sorted(error_counts.items())),
            "metrics": metric_summary,
        })
    return summaries


def _result_key(result: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(result.get("caseFingerprint", "")),
        str(result.get("model", "")),
        str(result.get("reasoningEffort", "")),
    )


def _result_sort_key(result: dict[str, Any]) -> tuple[int, int, str]:
    return (
        MODELS.index(result["model"]) if result.get("model") in MODELS else len(MODELS),
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
        if output.stat().st_size > 64 * 1024 * 1024:
            raise EvalPreflightError("existing eval output is unexpectedly large")
        value = json.loads(output.read_text(encoding="utf-8"))
    except EvalPreflightError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise EvalPreflightError("existing eval output is not valid JSON") from error
    if (
        not isinstance(value, dict)
        or value.get("formatVersion") != FORMAT_VERSION
        or value.get("scoringVersion") != SCORING_VERSION
        or value.get("evaluationFingerprint") != evaluation_fingerprint
        or not isinstance(value.get("results"), list)
    ):
        raise EvalPreflightError(
            "existing output belongs to another dataset or contract; choose a new --output or use --restart"
        )
    results: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in value["results"]:
        if not isinstance(row, dict):
            raise EvalPreflightError("existing eval output contains an invalid result")
        key = _result_key(row)
        status = row.get("status")
        actual = row.get("actual")
        if (
            not all(key)
            or row.get("model") not in MODELS
            or row.get("reasoningEffort") not in (*BASE_EFFORTS, HIGH_EFFORT)
            or status not in {"ok", "error"}
            or (status == "ok" and not isinstance(actual, dict))
            or (status == "error" and "actual" in row)
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
        try:
            directory_descriptor = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except OSError:
            pass
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def build_schedule(
    cases: list[PreparedCase],
    available_models: Iterable[str],
    high_models: Iterable[str],
) -> tuple[list[tuple[PreparedCase, str, str]], list[dict[str, str]]]:
    available = [model for model in MODELS if model in set(available_models)]
    requested_high = list(dict.fromkeys(high_models))
    schedule: list[tuple[PreparedCase, str, str]] = []
    skipped: list[dict[str, str]] = []
    for model in MODELS:
        if model not in available:
            for effort in BASE_EFFORTS:
                skipped.append({
                    "model": model,
                    "reasoningEffort": effort,
                    "reason": "not_in_account_catalog",
                })

    # Interleave the base matrix by receipt and rotate both model and effort
    # order, so drift, a late throttle, or a transient outage does not
    # systematically target one tier or reasoning level.
    for case_index, case in enumerate(cases):
        rotated = available[case_index % len(available):] + available[:case_index % len(available)]
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
            skipped.append({
                "model": model,
                "reasoningEffort": HIGH_EFFORT,
                "reason": "not_in_account_catalog",
            })
            continue
        available_high.append(model)
    # The explicitly selected quality-first configurations always run second,
    # interleaved by case and rotated to avoid ordering bias when comparing more
    # than one high-effort candidate.
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
    prompt_builder: Callable[[str, str], Any],
    output_schema: dict[str, Any],
    base_instructions: str,
) -> tuple[str, str]:
    prompt_contracts = sorted({
        (
            prompt_builder(case.context.locale, case.context.currency).instructions,
            prompt_builder(case.context.locale, case.context.currency).user_input,
        )
        for case in cases
    })
    contract = sha256_bytes(
        canonical_json({
            "baseInstructions": base_instructions,
            "prompts": [
                {"instructions": instructions, "userInput": user_input}
                for instructions, user_input in prompt_contracts
            ],
            "schema": output_schema,
        })
    )
    evaluation = sha256_bytes(
        str(FORMAT_VERSION).encode("ascii"),
        SCORING_VERSION.encode("ascii"),
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
        status = f", HTTP {error.info.status_code}" if error.info.status_code else ""
        raise EvalPreflightError(
            f"provider preflight failed: {error.info.category}{status}"
        ) from error
    if not isinstance(catalog, list):
        raise EvalPreflightError("provider returned an invalid model catalog")
    return {
        "connected": True,
        "planType": account.get("planType"),
        "accountStatusAttempts": account_attempts,
        "catalogAttempts": catalog_attempts,
    }, catalog


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
    rows = sorted(
        (row for key, row in results.items() if key in scheduled_keys),
        key=_result_sort_key,
    )
    completed = len(scheduled_keys.intersection(results))
    return {
        "formatVersion": FORMAT_VERSION,
        "scoringVersion": SCORING_VERSION,
        "createdAt": created_at,
        "updatedAt": utc_now(),
        "state": "complete" if completed == len(scheduled_keys) else "running",
        "evaluationFingerprint": evaluation_fingerprint,
        "contractFingerprint": contract_hash,
        "dataset": {
            "cases": len(cases),
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
        "results": rows,
    }


async def run(args: argparse.Namespace) -> None:
    requested_high = list(dict.fromkeys(args.high_model))
    if not (args.run and args.accept_subscription_usage):
        print(json.dumps({
            "mode": "plan-only",
            "models": list(MODELS),
            "baseReasoningEfforts": list(BASE_EFFORTS),
            "requestedHighModels": requested_high,
            "metrics": [
                "schemaValidity",
                *SUMMARY_METRICS,
                "effectiveQuality",
                "latencyMs",
                "errorCounts",
            ],
            "note": (
                "No dataset or credentials were read. Pass --run "
                "--accept-subscription-usage to validate the dataset, check the "
                "live account catalog, and make model calls."
            ),
        }, indent=2))
        return

    # Backend and image dependencies are imported only after both cost gates.
    from PIL import Image

    from app.config import get_settings
    from app.providers.common import (
        BASE_INSTRUCTIONS,
        build_receipt_prompt,
        parse_json_content,
        schema_for,
        strict_json_schema,
    )
    from app.schemas.ai import ExtractionContext, ReceiptExtraction
    from app.services.openai_codex import OpenAICodexService

    settings = get_settings()
    cases = validate_dataset(
        args.dataset,
        image_root=args.image_root,
        extraction_context_type=ExtractionContext,
        receipt_extraction_type=ReceiptExtraction,
        image_module=Image,
        max_image_bytes=settings.max_upload_bytes,
        max_image_pixels=settings.max_image_pixels,
        max_image_dimension=settings.max_image_dimension,
    )
    output_path = args.output.expanduser().resolve(strict=False)
    try:
        labels_path = (args.dataset.expanduser().resolve(strict=True) / "labels.json")
    except (FileNotFoundError, OSError) as error:
        raise EvalPreflightError("dataset changed after validation") from error
    protected_inputs = {labels_path, *(case.image_path for case in cases)}
    if output_path in protected_inputs:
        raise EvalPreflightError("output path cannot overwrite a label or image input")
    args.output = output_path
    output_schema = strict_json_schema(schema_for(ReceiptExtraction))
    contract_hash, evaluation_fingerprint = contract_fingerprint(
        cases,
        prompt_builder=build_receipt_prompt,
        output_schema=output_schema,
        base_instructions=BASE_INSTRUCTIONS,
    )
    created_at, results = load_resume_results(
        args.output,
        evaluation_fingerprint=evaluation_fingerprint,
        restart=args.restart,
    )

    service = OpenAICodexService(settings)
    try:
        provider, catalog = await provider_preflight(
            service,
            transient_retries=args.transient_retries,
            retry_base_seconds=args.retry_base_seconds,
        )
        catalog_ids = {
            model.get("id") for model in catalog
            if isinstance(model, dict) and isinstance(model.get("id"), str)
        }
        available_models = [model for model in MODELS if model in catalog_ids]
        if not available_models:
            raise EvalPreflightError("none of the GPT-5.6 eval models is in the account catalog")
        schedule, skipped = build_schedule(cases, available_models, requested_high)
        scheduled_keys = {
            (case.fingerprint, model, effort) for case, model, effort in schedule
        }
        if args.rerun_failures:
            for key in list(results):
                if key in scheduled_keys and results[key].get("status") == "error":
                    del results[key]

        def checkpoint() -> None:
            atomic_write_json(args.output, build_output(
                created_at=created_at,
                evaluation_fingerprint=evaluation_fingerprint,
                contract_hash=contract_hash,
                cases=cases,
                provider=provider,
                available_models=available_models,
                high_models=requested_high,
                skipped=skipped,
                scheduled_keys=scheduled_keys,
                results=results,
            ))

        checkpoint()
        for case, model, effort in schedule:
            key = (case.fingerprint, model, effort)
            if key not in scheduled_keys or key in results:
                continue
            image_bytes = read_prevalidated_image(case)
            started = time.perf_counter()

            async def operation() -> Any:
                prompt = build_receipt_prompt(
                    case.context.locale, case.context.currency
                )
                content = await service.structured_completion(
                    model=model,
                    instructions=prompt.instructions,
                    user_input=prompt.user_input,
                    output_schema=output_schema,
                    image_bytes=image_bytes,
                    mime_type=case.mime_type,
                    reasoning_effort=effort,
                )
                return ReceiptExtraction.model_validate(parse_json_content(content))

            try:
                actual, attempts = await call_with_retry(
                    operation,
                    transient_retries=args.transient_retries,
                    retry_base_seconds=args.retry_base_seconds,
                )
                metrics = score(case.expected, actual)
                result: dict[str, Any] = {
                    "status": "ok",
                    "attempts": attempts,
                    # The eval report is private and mode 0600. Keeping the
                    # canonical prediction makes scorer audits possible without
                    # spending another subscription call.
                    "actual": actual.model_dump(mode="json", by_alias=True),
                    **metrics,
                }
            except ClassifiedCallError as error:
                counts = error.info.category in MODEL_QUALITY_ERROR_CATEGORIES
                result = {
                    "status": "error",
                    "attempts": error.attempts,
                    "error": {
                        "category": error.info.category,
                        "type": type(error.__cause__).__name__ if error.__cause__ else None,
                        "statusCode": error.info.status_code,
                        "retryable": error.info.retryable,
                    },
                    **failure_metrics(case.expected, counts_against_quality=counts),
                }
            result.update({
                "model": model,
                "reasoningEffort": effort,
                "caseId": case.case_id,
                "caseFingerprint": case.fingerprint,
                "latencyMs": round((time.perf_counter() - started) * 1000),
                "completedAt": utc_now(),
            })
            results[key] = result
            checkpoint()
            if result["status"] == "error":
                error_category = result["error"]["category"]
                if error_category in {"authentication", "configuration", "unexpected"}:
                    raise EvalPreflightError(
                        f"eval stopped after global failure: {error_category}; "
                        "the checkpoint can be resumed after correction"
                    )
                if error_category in {"model_unavailable", "request_rejected"}:
                    # A model/effort configuration rejected once will not become
                    # valid for the remaining images in this run. Stop spending
                    # requests on it, but retain the classified first failure.
                    for pending_case, pending_model, pending_effort in schedule:
                        if (pending_model, pending_effort) == (model, effort):
                            scheduled_keys.discard(
                                (pending_case.fingerprint, pending_model, pending_effort)
                            )
                    scheduled_keys.add(key)
                    skipped.append({
                        "model": model,
                        "reasoningEffort": effort,
                        "reason": error_category,
                    })
                    checkpoint()
    finally:
        await service.close()
    print(args.output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=ROOT / "dataset")
    parser.add_argument(
        "--image-root",
        type=Path,
        help="root for image paths in labels.json (default: --dataset)",
    )
    parser.add_argument("--output", type=Path, default=ROOT / "dataset/results/gpt56.json")
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--accept-subscription-usage", action="store_true")
    parser.add_argument(
        "--high-model",
        action="append",
        choices=MODELS,
        default=[],
        help="run a second high-effort round for this catalog model; repeat as needed",
    )
    parser.add_argument(
        "--transient-retries",
        type=int,
        default=1,
        help="retries per call for timeouts, transport errors, 429, and 5xx (default: 1)",
    )
    parser.add_argument("--retry-base-seconds", type=float, default=2.0)
    parser.add_argument(
        "--restart",
        action="store_true",
        help="explicitly replace an existing compatible or incompatible output",
    )
    parser.add_argument(
        "--rerun-failures",
        action="store_true",
        help="resume successful rows but rerun previously checkpointed failures",
    )
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
