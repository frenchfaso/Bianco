#!/usr/bin/env python3
"""Analyze a Bianco GPT-5.6 evaluation without contacting a provider.

The input is the aggregate-free, per-receipt JSON v3 emitted by
``eval_gpt56_receipts.py``.  This script deliberately recomputes every value from
the result rows instead of trusting the embedded summary.  It writes only a
privacy-preserving aggregate report to stdout: case identifiers never appear in
the output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


INPUT_FORMAT_VERSION = 3
EXPECTED_SCORING_VERSION = "receipt-score-v3-null-penalty-global-match"
ANALYSIS_FORMAT_VERSION = 2
MAX_INPUT_BYTES = 64 * 1024 * 1024

FOCUS_METRICS = (
    "schemaValidity",
    "totalExact",
    "itemPriceExact",
    "itemRecall",
    "quality",
)
METRIC_RANGES = {
    "schemaValidity": (0.0, 1.0),
    "totalExact": (0.0, 1.0),
    "itemPriceExact": (0.0, 1.0),
    "itemRecall": (0.0, 1.0),
    "quality": (0.0, 100.0),
}
# Provider/schema failures are model-quality observations in the producer and
# already carry zero-valued effective metrics.  Every other error is treated as
# infrastructure unless explicitly classified here in a future format version.
MODEL_QUALITY_ERROR_CATEGORIES = frozenset({
    "structured_output",
})

MIN_RELIABLE_CASES = 10
MIN_SCHEMA_VALID_RATE = 0.95
MIN_TOTAL_COVERAGE = 0.80
MIN_ITEM_PRICE_COVERAGE = 0.50
CRITICAL_NONINFERIORITY_MARGIN = 0.02
DEFAULT_BOOTSTRAP_SAMPLES = 10_000
DEFAULT_SEED = 56_056


class AnalysisError(RuntimeError):
    """A safe-to-display input or analysis error."""


def _is_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


def _rounded(value: float | None) -> float | None:
    return None if value is None else round(float(value), 6)


def _mean(values: Iterable[float]) -> float | None:
    collected = list(values)
    return statistics.fmean(collected) if collected else None


def _issue(code: str, detail: str) -> dict[str, str]:
    return {"code": code, "detail": detail}


def load_input(path: Path) -> dict[str, Any]:
    """Read a bounded, regular JSON file without following an input symlink."""

    path = path.expanduser()
    if path.is_symlink() or not path.is_file():
        raise AnalysisError("input must be a regular non-symlink file")
    try:
        size = path.stat().st_size
        if not 1 <= size <= MAX_INPUT_BYTES:
            raise AnalysisError("input has an invalid size")
        value = json.loads(path.read_text(encoding="utf-8"))
    except AnalysisError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise AnalysisError("input is not valid UTF-8 JSON") from error
    if not isinstance(value, dict):
        raise AnalysisError("input root must be an object")
    return value


def _validate_metric(row: dict[str, Any], name: str, index: int) -> None:
    value = row.get(name)
    if value is None:
        return
    if not _is_number(value):
        raise AnalysisError(f"result {index}: {name} must be numeric or null")
    minimum, maximum = METRIC_RANGES[name]
    if not minimum <= float(value) <= maximum:
        raise AnalysisError(f"result {index}: {name} is outside its valid range")


def validate_input(value: dict[str, Any]) -> tuple[int, dict[str, Any], list[dict[str, Any]]]:
    """Validate the v3 envelope and the fields used for statistical analysis."""

    if value.get("formatVersion") != INPUT_FORMAT_VERSION:
        raise AnalysisError("only GPT-5.6 evaluation JSON formatVersion 3 is supported")
    if value.get("scoringVersion") != EXPECTED_SCORING_VERSION:
        raise AnalysisError("input uses an unsupported receipt scoring contract")

    dataset = value.get("dataset")
    matrix = value.get("matrix")
    rows = value.get("results")
    if not isinstance(dataset, dict) or not isinstance(matrix, dict) or not isinstance(rows, list):
        raise AnalysisError("input is missing dataset, matrix, or results")

    dataset_cases = dataset.get("cases")
    if (
        not isinstance(dataset_cases, int)
        or isinstance(dataset_cases, bool)
        or not 1 <= dataset_cases <= 1_000
    ):
        raise AnalysisError("dataset.cases must be an integer between 1 and 1000")

    for field in ("scheduledCalls", "completedCalls"):
        number = matrix.get(field)
        if not isinstance(number, int) or isinstance(number, bool) or number < 0:
            raise AnalysisError(f"matrix.{field} must be a non-negative integer")
    if matrix["completedCalls"] > matrix["scheduledCalls"]:
        raise AnalysisError("matrix.completedCalls cannot exceed matrix.scheduledCalls")

    seen: set[tuple[str, str, str]] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise AnalysisError(f"result {index}: row must be an object")
        model = row.get("model")
        effort = row.get("reasoningEffort")
        fingerprint = row.get("caseFingerprint")
        if not all(isinstance(item, str) and item for item in (model, effort, fingerprint)):
            raise AnalysisError(
                f"result {index}: model, reasoningEffort and caseFingerprint are required"
            )
        key = (model, effort, fingerprint)
        if key in seen:
            raise AnalysisError(f"result {index}: duplicate configuration/case result")
        seen.add(key)

        status = row.get("status")
        if status not in {"ok", "error"}:
            raise AnalysisError(f"result {index}: invalid status")
        if status == "error":
            error = row.get("error")
            if not isinstance(error, dict) or not isinstance(error.get("category"), str):
                raise AnalysisError(f"result {index}: error result needs a category")
            if "actual" in row:
                raise AnalysisError(f"result {index}: error result cannot contain actual")
        elif not isinstance(row.get("actual"), dict):
            raise AnalysisError(f"result {index}: successful result needs canonical actual")
        for metric in FOCUS_METRICS:
            _validate_metric(row, metric, index)

    return dataset_cases, matrix, rows


def _configuration_ref(key: tuple[str, str]) -> dict[str, str]:
    return {"model": key[0], "reasoningEffort": key[1]}


def _metric_summary(rows: list[dict[str, Any]], name: str) -> dict[str, int | float | None]:
    values = [float(row[name]) for row in rows if _is_number(row.get(name))]
    return {
        "scoredCases": len(values),
        "coverage": _rounded(len(values) / len(rows)) if rows else 0.0,
        "mean": _rounded(_mean(values)),
    }


def _selection_score(metrics: dict[str, dict[str, int | float | None]]) -> float | None:
    # `quality` is already the producer's documented weighted composite. Adding
    # its component metrics here would silently count total, price and recall a
    # second time. Critical metrics remain explicit selection guardrails below.
    value = metrics["quality"]["mean"]
    return float(value) if _is_number(value) else None


def _configuration_summary(
    key: tuple[str, str],
    rows: list[dict[str, Any]],
    dataset_cases: int,
    expected_fingerprints: set[str],
) -> dict[str, Any]:
    errors = Counter(
        str(row["error"]["category"])
        for row in rows
        if row.get("status") == "error" and isinstance(row.get("error"), dict)
    )
    quality_errors = {
        category: count
        for category, count in sorted(errors.items())
        if category in MODEL_QUALITY_ERROR_CATEGORIES
    }
    infrastructure_errors = {
        category: count
        for category, count in sorted(errors.items())
        if category not in MODEL_QUALITY_ERROR_CATEGORIES
    }
    metrics = {name: _metric_summary(rows, name) for name in FOCUS_METRICS}
    fingerprints = {str(row["caseFingerprint"]) for row in rows}
    sample_complete = (
        len(rows) == dataset_cases
        and len(expected_fingerprints) == dataset_cases
        and fingerprints == expected_fingerprints
    )

    ineligible_reasons: list[str] = []
    if not sample_complete:
        ineligible_reasons.append("incomplete_sample")
    if fingerprints != expected_fingerprints:
        ineligible_reasons.append("mismatched_case_set")
    if infrastructure_errors:
        ineligible_reasons.append("infrastructure_errors")
    if metrics["schemaValidity"]["scoredCases"] != dataset_cases:
        ineligible_reasons.append("incomplete_schema_coverage")
    if metrics["quality"]["scoredCases"] != dataset_cases:
        ineligible_reasons.append("incomplete_quality_coverage")
    if float(metrics["totalExact"]["coverage"] or 0.0) < MIN_TOTAL_COVERAGE:
        ineligible_reasons.append("insufficient_total_coverage")
    if metrics["itemRecall"]["scoredCases"] != dataset_cases:
        ineligible_reasons.append("incomplete_recall_coverage")
    if float(metrics["itemPriceExact"]["coverage"] or 0.0) < MIN_ITEM_PRICE_COVERAGE:
        ineligible_reasons.append("insufficient_item_price_coverage")

    return {
        "configuration": _configuration_ref(key),
        "observedCases": len(rows),
        "expectedCases": dataset_cases,
        "sampleComplete": sample_complete,
        "caseSetComplete": fingerprints == expected_fingerprints,
        "successfulCases": sum(row.get("status") == "ok" for row in rows),
        "successRate": _rounded(
            sum(row.get("status") == "ok" for row in rows) / len(rows)
        ),
        "modelQualityErrors": quality_errors,
        "infrastructureErrors": infrastructure_errors,
        "metrics": metrics,
        "selectionScore": _rounded(_selection_score(metrics)),
        "eligible": not ineligible_reasons,
        "ineligibleReasons": ineligible_reasons,
    }


def _bootstrap_quality_ci(
    differences: list[float],
    *,
    samples: int,
    seed: int,
) -> dict[str, float] | None:
    if not differences:
        return None
    randomizer = random.Random(seed)
    size = len(differences)
    estimates = sorted(
        sum(differences[randomizer.randrange(size)] for _ in range(size)) / size
        for _ in range(samples)
    )
    lower_index = math.floor(0.025 * (samples - 1))
    upper_index = math.ceil(0.975 * (samples - 1))
    return {
        "lower": round(estimates[lower_index], 6),
        "upper": round(estimates[upper_index], 6),
    }


def _pair_seed(seed: int, left: tuple[str, str], right: tuple[str, str]) -> int:
    digest = hashlib.sha256(
        f"{seed}\0{left[0]}\0{left[1]}\0{right[0]}\0{right[1]}".encode("utf-8")
    ).digest()
    return int.from_bytes(digest[:8], "big")


def _paired_metric(
    left_rows: dict[str, dict[str, Any]],
    right_rows: dict[str, dict[str, Any]],
    name: str,
) -> tuple[list[float], list[float], list[float]]:
    left_values: list[float] = []
    right_values: list[float] = []
    differences: list[float] = []
    for fingerprint in sorted(left_rows.keys() & right_rows.keys()):
        left_value = left_rows[fingerprint].get(name)
        right_value = right_rows[fingerprint].get(name)
        if not (_is_number(left_value) and _is_number(right_value)):
            continue
        left_number = float(left_value)
        right_number = float(right_value)
        left_values.append(left_number)
        right_values.append(right_number)
        differences.append(left_number - right_number)
    return left_values, right_values, differences


def _paired_comparison(
    left: tuple[str, str],
    right: tuple[str, str],
    rows_by_configuration: dict[tuple[str, str], list[dict[str, Any]]],
    *,
    dataset_cases: int,
    bootstrap_samples: int,
    seed: int,
) -> dict[str, Any]:
    left_rows = {row["caseFingerprint"]: row for row in rows_by_configuration[left]}
    right_rows = {row["caseFingerprint"]: row for row in rows_by_configuration[right]}
    metric_differences: dict[str, Any] = {}
    quality_differences: list[float] = []

    for name in FOCUS_METRICS:
        left_values, right_values, differences = _paired_metric(
            left_rows, right_rows, name
        )
        metric_differences[name] = {
            "pairedCases": len(differences),
            "leftMean": _rounded(_mean(left_values)),
            "rightMean": _rounded(_mean(right_values)),
            "meanDifference": _rounded(_mean(differences)),
        }
        if name == "quality":
            quality_differences = differences

    wins = sum(difference > 1e-12 for difference in quality_differences)
    losses = sum(difference < -1e-12 for difference in quality_differences)
    ties = len(quality_differences) - wins - losses
    metric_differences["quality"].update({
        "bootstrap95CI": _bootstrap_quality_ci(
            quality_differences,
            samples=bootstrap_samples,
            seed=_pair_seed(seed, left, right),
        ),
        "wins": wins,
        "ties": ties,
        "losses": losses,
    })

    return {
        "left": _configuration_ref(left),
        "right": _configuration_ref(right),
        "sharedReceipts": len(left_rows.keys() & right_rows.keys()),
        "expectedReceipts": dataset_cases,
        "metrics": metric_differences,
    }


def _ranking_sort_key(summary: dict[str, Any]) -> tuple[Any, ...]:
    score = summary["selectionScore"]
    configuration = summary["configuration"]
    return (
        0 if summary["eligible"] else 1,
        -(float(score) if _is_number(score) else -1.0),
        configuration["model"],
        configuration["reasoningEffort"],
    )


def _global_reliability_issues(
    value: dict[str, Any],
    matrix: dict[str, Any],
    rows: list[dict[str, Any]],
    summaries: list[dict[str, Any]],
    dataset_cases: int,
    observed_fingerprints: int,
) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    if value.get("state") != "complete":
        issues.append(_issue("evaluation_not_complete", "The producer has not marked the run complete."))
    if matrix["completedCalls"] != matrix["scheduledCalls"]:
        issues.append(_issue("scheduled_sample_incomplete", "Not every scheduled call is complete."))
    if matrix["completedCalls"] != len(rows):
        issues.append(_issue("completed_count_mismatch", "The completed-call count differs from the result rows."))
    if dataset_cases < MIN_RELIABLE_CASES:
        issues.append(_issue(
            "sample_too_small",
            f"At least {MIN_RELIABLE_CASES} labelled receipts are required for a recommendation.",
        ))
    if observed_fingerprints != dataset_cases:
        issues.append(_issue(
            "receipt_set_size_mismatch",
            "The distinct receipt fingerprints do not match dataset.cases.",
        ))
    if any(not summary["caseSetComplete"] for summary in summaries):
        issues.append(_issue(
            "configuration_case_set_mismatch",
            "Configurations were not evaluated on the identical receipt set.",
        ))
    if any(not summary["sampleComplete"] for summary in summaries):
        issues.append(_issue(
            "configuration_sample_incomplete",
            "At least one evaluated configuration does not cover the complete receipt set.",
        ))
    if any(summary["infrastructureErrors"] for summary in summaries):
        issues.append(_issue(
            "infrastructure_errors",
            "Infrastructure failures are present and must not be interpreted as model quality.",
        ))
    coverage_reasons = {
        reason
        for summary in summaries
        for reason in summary["ineligibleReasons"]
        if reason not in {"incomplete_sample", "infrastructure_errors"}
    }
    if coverage_reasons:
        issues.append(_issue(
            "configuration_metric_coverage_incomplete",
            "At least one configuration lacks the metric coverage required for a fair comparison.",
        ))
    if len([summary for summary in summaries if summary["eligible"]]) < 2:
        issues.append(_issue(
            "insufficient_eligible_configurations",
            "At least two complete, infrastructure-clean configurations are required.",
        ))
    return issues


def _decision(
    ranking: list[dict[str, Any]],
    comparisons: list[dict[str, Any]],
    reliability_issues: list[dict[str, str]],
) -> dict[str, Any]:
    reasons = list(reliability_issues)
    eligible = [summary for summary in ranking if summary["eligible"]]
    best_observed = eligible[0]["configuration"] if eligible else (
        ranking[0]["configuration"] if ranking else None
    )
    runner_up = eligible[1]["configuration"] if len(eligible) > 1 else None
    if reasons or len(eligible) < 2:
        return {
            "status": "inconclusive",
            "winner": None,
            "bestObserved": best_observed,
            "runnerUp": runner_up,
            "evidence": None,
            "reasons": reasons,
        }

    candidate = eligible[0]
    candidate_ref = candidate["configuration"]
    schema_rate = candidate["metrics"]["schemaValidity"]["mean"]
    if not _is_number(schema_rate) or float(schema_rate) < MIN_SCHEMA_VALID_RATE:
        reasons.append(_issue(
            "winner_schema_below_threshold",
            f"The leading configuration is below {MIN_SCHEMA_VALID_RATE:.0%} schema validity.",
        ))

    if candidate["selectionScore"] == eligible[1]["selectionScore"]:
        reasons.append(_issue("ranking_tie", "The two leading configurations have the same selection score."))

    competitor = eligible[1]["configuration"]
    comparison = next(
        (
            item for item in comparisons
            if item["left"] == candidate_ref and item["right"] == competitor
        ),
        None,
    )
    evidence: dict[str, Any] | None = None
    if comparison is None:
        reasons.append(_issue("missing_paired_comparison", "The top-two paired comparison is missing."))
    else:
        quality = comparison["metrics"]["quality"]
        interval = quality["bootstrap95CI"]
        evidence = {
            "pairedReceipts": quality["pairedCases"],
            "qualityMeanDifference": quality["meanDifference"],
            "qualityBootstrap95CI": interval,
            "qualityWins": quality["wins"],
            "qualityTies": quality["ties"],
            "qualityLosses": quality["losses"],
        }
        if (
            comparison["sharedReceipts"] != candidate["expectedCases"]
            or quality["pairedCases"] != candidate["expectedCases"]
        ):
            reasons.append(_issue(
                "incomplete_paired_receipt_set",
                "The top-two decision does not contain every labelled receipt.",
            ))
        elif not isinstance(interval, dict) or float(interval["lower"]) <= 0.0:
            reasons.append(_issue(
                "quality_difference_not_resolved",
                "The observed leader's paired quality advantage is not above zero at 95% confidence.",
            ))

        for name in ("schemaValidity", "totalExact", "itemPriceExact", "itemRecall"):
            metric = comparison["metrics"][name]
            difference = metric["meanDifference"]
            if not _is_number(difference):
                reasons.append(_issue(
                    "missing_paired_critical_metric",
                    f"The paired {name} comparison has no scoreable observations.",
                ))
            elif float(difference) < -CRITICAL_NONINFERIORITY_MARGIN:
                reasons.append(_issue(
                    "critical_metric_regression",
                    f"The observed leader trails by more than {CRITICAL_NONINFERIORITY_MARGIN:.0%} on {name}.",
                ))

    if reasons:
        # Deduplicate reasons that can recur against multiple competitors while
        # preserving the first, most actionable occurrence.
        unique = list({reason["code"]: reason for reason in reasons}.values())
        return {
            "status": "best_observed",
            "winner": None,
            "bestObserved": candidate_ref,
            "runnerUp": competitor,
            "evidence": evidence,
            "reasons": unique,
        }
    return {
        "status": "supported_winner",
        "winner": candidate_ref,
        "bestObserved": candidate_ref,
        "runnerUp": competitor,
        "evidence": evidence,
        "reasons": [],
    }


def analyze(
    value: dict[str, Any],
    *,
    bootstrap_samples: int = DEFAULT_BOOTSTRAP_SAMPLES,
    seed: int = DEFAULT_SEED,
) -> dict[str, Any]:
    if not 100 <= bootstrap_samples <= 100_000:
        raise AnalysisError("bootstrap_samples must be between 100 and 100000")
    dataset_cases, matrix, rows = validate_input(value)

    rows_by_configuration: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        key = (row["model"], row["reasoningEffort"])
        rows_by_configuration.setdefault(key, []).append(row)

    expected_fingerprints = {
        str(row["caseFingerprint"])
        for row in rows
    }

    ranking = sorted(
        (
            _configuration_summary(
                key,
                configuration_rows,
                dataset_cases,
                expected_fingerprints,
            )
            for key, configuration_rows in rows_by_configuration.items()
        ),
        key=_ranking_sort_key,
    )
    for rank, summary in enumerate(ranking, start=1):
        summary["rank"] = rank

    ordered_keys = [
        (summary["configuration"]["model"], summary["configuration"]["reasoningEffort"])
        for summary in ranking
    ]
    comparisons = [
        _paired_comparison(
            left,
            right,
            rows_by_configuration,
            dataset_cases=dataset_cases,
            bootstrap_samples=bootstrap_samples,
            seed=seed,
        )
        for left_index, left in enumerate(ordered_keys)
        for right in ordered_keys[left_index + 1 :]
    ]
    reliability_issues = _global_reliability_issues(
        value,
        matrix,
        rows,
        ranking,
        dataset_cases,
        len(expected_fingerprints),
    )

    skipped = matrix.get("skippedConfigurations")
    skipped_count = len(skipped) if isinstance(skipped, list) else 0
    return {
        "analysisFormatVersion": ANALYSIS_FORMAT_VERSION,
        "source": {
            "formatVersion": INPUT_FORMAT_VERSION,
            "scoringVersion": EXPECTED_SCORING_VERSION,
            "state": value.get("state"),
            "datasetCases": dataset_cases,
            "scheduledCalls": matrix["scheduledCalls"],
            "completedCalls": matrix["completedCalls"],
            "skippedConfigurations": skipped_count,
        },
        "method": {
            "rankingMetric": "quality",
            "bootstrapSamples": bootstrap_samples,
            "bootstrapSeed": seed,
            "confidenceLevel": 0.95,
            "minimumReliableCases": MIN_RELIABLE_CASES,
            "minimumSchemaValidRate": MIN_SCHEMA_VALID_RATE,
            "criticalNoninferiorityMargin": CRITICAL_NONINFERIORITY_MARGIN,
        },
        "reliability": {
            "status": "reliable" if not reliability_issues else "unreliable",
            "issues": reliability_issues,
        },
        "ranking": ranking,
        "pairedComparisons": comparisons,
        "decision": _decision(ranking, comparisons, reliability_issues),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze a Bianco GPT-5.6 evaluation JSON v3 without network access."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument(
        "--bootstrap-samples",
        type=int,
        default=DEFAULT_BOOTSTRAP_SAMPLES,
    )
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()
    try:
        report = analyze(
            load_input(args.input),
            bootstrap_samples=args.bootstrap_samples,
            seed=args.seed,
        )
    except AnalysisError as error:
        parser.exit(2, f"error: {error}\n")
    print(json.dumps(
        report,
        indent=None if args.compact else 2,
        separators=(",", ":") if args.compact else None,
        sort_keys=False,
    ))


if __name__ == "__main__":
    main()
