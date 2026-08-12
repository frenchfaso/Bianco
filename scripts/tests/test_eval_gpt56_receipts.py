import asyncio
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


SCRIPT = Path(__file__).resolve().parents[1] / "eval_gpt56_receipts.py"
SPEC = importlib.util.spec_from_file_location("bianco_gpt56_eval", SCRIPT)
assert SPEC and SPEC.loader
evals = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = evals
SPEC.loader.exec_module(evals)


def merchant(raw="Shop", normalized="Shop"):
    return SimpleNamespace(raw_name=raw, normalized_name=normalized)


def item(name, price, *, category="food_grocery", quantity=1, unit_price=None):
    return SimpleNamespace(
        raw_name=name,
        normalized_name=name,
        total_price_minor=price,
        unit_price_minor=unit_price,
        quantity=quantity,
        category_id=category,
    )


def receipt(
    items,
    *,
    total=300,
    currency="EUR",
    date=None,
    subtotal=None,
    tax=None,
    discount=None,
    category="food_grocery",
):
    return SimpleNamespace(
        merchant=merchant(),
        transaction_date=date,
        currency=currency,
        subtotal_minor=subtotal,
        tax_minor=tax,
        discount_minor=discount,
        total_minor=total,
        category_id=category,
        items=items,
    )


class EvalMetricTests(unittest.TestCase):
    def test_item_matching_never_uses_the_price_being_scored(self):
        expected = [item("RED APPLE", 100), item("GREEN APPLE", 200)]
        actual = [item("RED APPLE", 200), item("GREEN APPLE", 100)]

        self.assertEqual(set(evals.match_items(expected, actual)), {(0, 0), (1, 1)})
        metrics = evals.score(receipt(expected), receipt(actual))
        self.assertEqual(metrics["itemRecall"], 1.0)
        self.assertEqual(metrics["itemPriceExact"], 0.0)

    def test_header_is_null_safe_and_excludes_total_and_legacy_category(self):
        expected = receipt([], total=300, currency="EUR", category="home")
        actual = receipt([], total=999, currency="USD", category="restaurant")

        metrics = evals.score(expected, actual)

        self.assertEqual(metrics["headerExact"], 0.0)
        self.assertEqual(metrics["currencyExact"], 0.0)
        self.assertIsNone(metrics["transactionDateExact"])
        self.assertIsNone(metrics["subtotalExact"])
        self.assertEqual(metrics["totalExact"], 0.0)
        self.assertNotIn("categoryExact", metrics)

    def test_payment_only_receipt_penalizes_invented_lines(self):
        metrics = evals.score(receipt([]), receipt([item("INVENTED", 300)]))

        self.assertEqual(metrics["itemRecall"], 0.0)
        self.assertEqual(metrics["itemPrecision"], 0.0)
        self.assertIsNone(metrics["itemNameSimilarity"])

    def test_summary_separates_infrastructure_failure_from_quality(self):
        valid = {
            "model": "gpt-5.6-terra",
            "reasoningEffort": "medium",
            "status": "ok",
            "schemaValidity": 1.0,
            "quality": 88.0,
            "latencyMs": 100,
            "attempts": 1,
            **{metric: 1.0 for metric in evals.SUMMARY_METRICS},
        }
        infrastructure = {
            "model": "gpt-5.6-terra",
            "reasoningEffort": "medium",
            "status": "error",
            "schemaValidity": None,
            "quality": None,
            "latencyMs": 200,
            "attempts": 2,
            "error": {"category": "authentication"},
            **{metric: None for metric in evals.SUMMARY_METRICS},
        }

        summary = evals.aggregate([valid, infrastructure])[0]

        self.assertEqual(summary["successRate"], 0.5)
        self.assertEqual(summary["effectiveQuality"], 88.0)
        self.assertEqual(summary["errorCounts"], {"authentication": 1})
        self.assertEqual(summary["metrics"]["totalExact"]["scoredCases"], 1)


class EvalSafetyTests(unittest.TestCase):
    def test_output_path_cannot_replace_a_dataset_input(self):
        source = Path(evals.run.__code__.co_filename).read_text(encoding="utf-8")

        self.assertIn(
            'raise EvalPreflightError("output path cannot overwrite a label or image input")',
            source,
        )

    def test_image_path_rejects_traversal_and_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "images"
            root.mkdir()
            image = root / "receipt.jpeg"
            image.write_bytes(b"image")
            outside = Path(temporary) / "secret.jpeg"
            outside.write_bytes(b"secret")
            linked = root / "linked.jpeg"
            linked.symlink_to(outside)

            case_id, resolved = evals._safe_image_path(root.resolve(), "receipt.jpeg", 0)
            self.assertEqual(case_id, "receipt.jpeg")
            self.assertEqual(resolved, image.resolve())
            with self.assertRaises(evals.EvalPreflightError):
                evals._safe_image_path(root.resolve(), "../secret.jpeg", 1)
            with self.assertRaises(evals.EvalPreflightError):
                evals._safe_image_path(root.resolve(), "linked.jpeg", 2)

    def test_atomic_checkpoint_can_be_resumed(self):
        row = {
            "caseFingerprint": "case-fingerprint",
            "model": "gpt-5.6-terra",
            "reasoningEffort": "medium",
            "status": "ok",
        }
        payload = {
            "formatVersion": evals.FORMAT_VERSION,
            "evaluationFingerprint": "eval-fingerprint",
            "createdAt": "2026-08-12T00:00:00Z",
            "results": [row],
        }
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "results" / "eval.json"
            evals.atomic_write_json(output, payload)
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            created_at, rows = evals.load_resume_results(
                output,
                evaluation_fingerprint="eval-fingerprint",
                restart=False,
            )

        self.assertEqual(created_at, "2026-08-12T00:00:00Z")
        self.assertEqual(list(rows.values()), [row])

    def test_retry_is_bounded_and_only_for_transient_failure(self):
        calls = 0
        delays = []

        class RateLimitedError(Exception):
            response = SimpleNamespace(status_code=429, headers={"Retry-After": "0"})

        async def operation():
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RateLimitedError()
            return "ok"

        async def sleep(delay):
            delays.append(delay)

        result, attempts = asyncio.run(evals.call_with_retry(
            operation,
            transient_retries=1,
            retry_base_seconds=2,
            sleep=sleep,
        ))

        self.assertEqual((result, attempts), ("ok", 2))
        self.assertEqual(delays, [0.0])

    def test_schedule_uses_catalog_and_selective_high_round(self):
        cases = [SimpleNamespace(fingerprint="a"), SimpleNamespace(fingerprint="b")]
        schedule, skipped = evals.build_schedule(
            cases,
            ["gpt-5.6-terra", "gpt-5.6-luna"],
            ["gpt-5.6-terra", "gpt-5.6-sol"],
        )

        configurations = {(model, effort) for _case, model, effort in schedule}
        self.assertIn(("gpt-5.6-terra", "high"), configurations)
        self.assertNotIn(("gpt-5.6-sol", "high"), configurations)
        self.assertEqual(len(schedule), 10)  # 2 cases * (2 models * 2 efforts + Terra high)
        self.assertIn({
            "model": "gpt-5.6-sol",
            "reasoningEffort": "high",
            "reason": "not_in_account_catalog",
        }, skipped)


if __name__ == "__main__":
    unittest.main()
