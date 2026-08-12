import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "analyze_gpt56_eval.py"
SPEC = importlib.util.spec_from_file_location("bianco_gpt56_analysis", SCRIPT)
assert SPEC and SPEC.loader
analysis = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = analysis
SPEC.loader.exec_module(analysis)


def result(
    model,
    effort,
    case,
    quality,
    *,
    schema=1.0,
    total=1.0,
    price=1.0,
    recall=1.0,
    error=None,
):
    row = {
        "model": model,
        "reasoningEffort": effort,
        "caseFingerprint": f"fingerprint-{case}",
        "caseId": f"private-name-{case}.webp",
        "status": "error" if error else "ok",
        "schemaValidity": schema,
        "totalExact": total,
        "itemPriceExact": price,
        "itemRecall": recall,
        "quality": quality,
    }
    if error:
        row["error"] = {"category": error}
    else:
        row["actual"] = {}
    return row


def payload(rows, *, cases=12, state="complete", scheduled=None, completed=None):
    scheduled = len(rows) if scheduled is None else scheduled
    completed = len(rows) if completed is None else completed
    return {
        "formatVersion": 3,
        "scoringVersion": analysis.EXPECTED_SCORING_VERSION,
        "state": state,
        "dataset": {"cases": cases, "fingerprint": "dataset-fingerprint"},
        "matrix": {
            "scheduledCalls": scheduled,
            "completedCalls": completed,
            "skippedConfigurations": [],
        },
        # Deliberately bogus: the analyzer must recompute from result rows.
        "summary": [{"effectiveQuality": 0}],
        "results": rows,
    }


def strong_winner_rows(cases=12):
    rows = []
    for case in range(cases):
        rows.append(result("gpt-5.6-terra", "medium", case, 94.0))
        rows.append(result(
            "gpt-5.6-luna",
            "medium",
            case,
            64.0,
            total=0.0 if case % 3 == 0 else 1.0,
            price=0.0 if case % 4 == 0 else 1.0,
            recall=0.8,
        ))
    return rows


class AnalysisTests(unittest.TestCase):
    def test_ranking_paired_ci_and_reliable_winner(self):
        report = analysis.analyze(
            payload(strong_winner_rows()),
            bootstrap_samples=500,
            seed=123,
        )

        self.assertEqual(report["reliability"]["status"], "reliable")
        self.assertEqual(report["decision"]["status"], "supported_winner")
        self.assertEqual(
            report["decision"]["winner"],
            {"model": "gpt-5.6-terra", "reasoningEffort": "medium"},
        )
        self.assertEqual(report["decision"]["bestObserved"], report["decision"]["winner"])
        self.assertEqual(report["decision"]["reasons"], [])
        self.assertEqual(report["ranking"][0]["metrics"]["quality"]["mean"], 94.0)
        self.assertEqual(report["ranking"][0]["selectionScore"], 94.0)
        self.assertGreater(
            report["ranking"][0]["selectionScore"],
            report["ranking"][1]["selectionScore"],
        )
        quality = report["pairedComparisons"][0]["metrics"]["quality"]
        self.assertEqual(quality["pairedCases"], 12)
        self.assertEqual(quality["meanDifference"], 30.0)
        self.assertEqual(quality["bootstrap95CI"], {"lower": 30.0, "upper": 30.0})
        self.assertEqual((quality["wins"], quality["ties"], quality["losses"]), (12, 0, 0))

    def test_bootstrap_is_deterministic_and_case_names_are_not_reported(self):
        rows = []
        left_quality = [90, 80, 70, 95, 75, 85, 92, 73, 88, 79, 91, 82]
        right_quality = [80, 80, 80, 70, 85, 75, 77, 83, 78, 89, 81, 92]
        for case, (left, right) in enumerate(zip(left_quality, right_quality)):
            rows.append(result("gpt-5.6-terra", "low", case, left))
            rows.append(result("gpt-5.6-luna", "low", case, right))

        first = analysis.analyze(payload(rows), bootstrap_samples=1_000, seed=77)
        second = analysis.analyze(payload(rows), bootstrap_samples=1_000, seed=77)

        self.assertEqual(first, second)
        serialized = json.dumps(first)
        self.assertNotIn("private-name", serialized)
        quality = first["pairedComparisons"][0]["metrics"]["quality"]
        self.assertEqual((quality["wins"], quality["ties"], quality["losses"]), (6, 1, 5))

    def test_infrastructure_error_and_incomplete_sample_are_inconclusive(self):
        rows = strong_winner_rows()
        rows.pop()  # Luna is now missing one receipt.
        rows[0] = result(
            "gpt-5.6-terra",
            "medium",
            0,
            None,
            schema=None,
            total=None,
            price=None,
            recall=None,
            error="timeout",
        )
        report = analysis.analyze(
            payload(rows, state="running", scheduled=24, completed=23),
            bootstrap_samples=200,
        )

        codes = {issue["code"] for issue in report["reliability"]["issues"]}
        self.assertIn("evaluation_not_complete", codes)
        self.assertIn("scheduled_sample_incomplete", codes)
        self.assertIn("configuration_sample_incomplete", codes)
        self.assertIn("infrastructure_errors", codes)
        self.assertEqual(report["decision"]["status"], "inconclusive")
        self.assertIsNotNone(report["decision"]["bestObserved"])
        self.assertIsNone(report["decision"]["winner"])
        terra = next(
            row for row in report["ranking"]
            if row["configuration"]["model"] == "gpt-5.6-terra"
        )
        self.assertEqual(terra["infrastructureErrors"], {"timeout": 1})
        self.assertNotIn("timeout", terra["modelQualityErrors"])

    def test_model_quality_failure_is_scored_not_called_infrastructure(self):
        rows = strong_winner_rows()
        rows[0] = result(
            "gpt-5.6-terra",
            "medium",
            0,
            0.0,
            schema=0.0,
            total=0.0,
            price=0.0,
            recall=0.0,
            error="structured_output",
        )

        report = analysis.analyze(payload(rows), bootstrap_samples=200)
        terra = next(
            row for row in report["ranking"]
            if row["configuration"]["model"] == "gpt-5.6-terra"
        )

        self.assertEqual(terra["modelQualityErrors"], {"structured_output": 1})
        self.assertEqual(terra["infrastructureErrors"], {})
        self.assertEqual(terra["metrics"]["quality"]["scoredCases"], 12)

    def test_provider_response_is_infrastructure_not_model_quality(self):
        rows = strong_winner_rows()
        rows[0] = result(
            "gpt-5.6-terra",
            "medium",
            0,
            None,
            schema=None,
            total=None,
            price=None,
            recall=None,
            error="provider_response",
        )

        report = analysis.analyze(payload(rows), bootstrap_samples=200)
        terra = next(
            row for row in report["ranking"]
            if row["configuration"]["model"] == "gpt-5.6-terra"
        )
        self.assertEqual(terra["modelQualityErrors"], {})
        self.assertEqual(terra["infrastructureErrors"], {"provider_response": 1})
        self.assertEqual(report["decision"]["status"], "inconclusive")

    def test_different_receipt_sets_are_rejected_even_with_equal_counts(self):
        rows = strong_winner_rows()
        luna = [
            row for row in rows
            if row["model"] == "gpt-5.6-luna"
        ]
        luna[-1]["caseFingerprint"] = "fingerprint-from-another-dataset"

        report = analysis.analyze(payload(rows), bootstrap_samples=200)

        codes = {issue["code"] for issue in report["reliability"]["issues"]}
        self.assertIn("receipt_set_size_mismatch", codes)
        self.assertIn("configuration_case_set_mismatch", codes)
        self.assertEqual(report["decision"]["status"], "inconclusive")

    def test_valid_but_unresolved_quality_difference_is_inconclusive(self):
        rows = []
        for case in range(12):
            rows.append(result("gpt-5.6-terra", "low", case, 90 if case % 2 else 80))
            rows.append(result("gpt-5.6-luna", "low", case, 80 if case % 2 else 90))

        report = analysis.analyze(payload(rows), bootstrap_samples=500, seed=1)

        self.assertEqual(report["reliability"]["status"], "reliable")
        self.assertEqual(report["decision"]["status"], "best_observed")
        self.assertIsNotNone(report["decision"]["bestObserved"])
        self.assertIsNone(report["decision"]["winner"])
        codes = {reason["code"] for reason in report["decision"]["reasons"]}
        self.assertIn("ranking_tie", codes)
        self.assertIn("quality_difference_not_resolved", codes)

    def test_missing_metric_coverage_blocks_selection_even_with_two_eligible_peers(self):
        rows = strong_winner_rows()
        for case in range(12):
            rows.append(result(
                "gpt-5.6-sol",
                "medium",
                case,
                None,
                schema=None,
                total=None,
                price=None,
                recall=None,
            ))

        report = analysis.analyze(payload(rows), bootstrap_samples=200)

        codes = {issue["code"] for issue in report["reliability"]["issues"]}
        self.assertIn("configuration_metric_coverage_incomplete", codes)
        self.assertEqual(report["decision"]["status"], "inconclusive")

    def test_rejects_wrong_format_duplicate_rows_and_out_of_range_metric(self):
        wrong_format = payload(strong_winner_rows())
        wrong_format["formatVersion"] = 1
        with self.assertRaises(analysis.AnalysisError):
            analysis.analyze(wrong_format)

        duplicate = payload(strong_winner_rows())
        duplicate["results"].append(dict(duplicate["results"][0]))
        duplicate["matrix"]["scheduledCalls"] += 1
        duplicate["matrix"]["completedCalls"] += 1
        with self.assertRaises(analysis.AnalysisError):
            analysis.analyze(duplicate)

        out_of_range = payload(strong_winner_rows())
        out_of_range["results"][0]["quality"] = 101
        with self.assertRaises(analysis.AnalysisError):
            analysis.analyze(out_of_range)

    def test_cli_outputs_json_and_does_not_modify_input(self):
        with tempfile.TemporaryDirectory() as temporary:
            input_path = Path(temporary) / "synthetic.json"
            input_path.write_text(json.dumps(payload(strong_winner_rows())), encoding="utf-8")
            before = input_path.read_bytes()

            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    str(input_path),
                    "--bootstrap-samples",
                    "200",
                    "--compact",
                ],
                check=True,
                capture_output=True,
                text=True,
            )

            self.assertEqual(input_path.read_bytes(), before)
            self.assertEqual(
                json.loads(completed.stdout)["decision"]["status"],
                "supported_winner",
            )


if __name__ == "__main__":
    unittest.main()
