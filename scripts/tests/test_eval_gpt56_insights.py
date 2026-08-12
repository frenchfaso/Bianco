import asyncio
import importlib.util
import json
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/eval_gpt56_insights.py"
FIXTURES = ROOT / "dataset/gpt56_insight_fixtures.json"

SPEC = importlib.util.spec_from_file_location("eval_gpt56_insights", SCRIPT)
assert SPEC and SPEC.loader
EVAL = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = EVAL
SPEC.loader.exec_module(EVAL)


def prepared_case(case_id="case-it", locale="it-IT", payload=None):
    default_payload = {
        "locale": locale,
        "currency": "EUR",
        "amountUnit": "major",
        "period": {
            "start": "2026-06-01",
            "end": "2026-06-30",
            "previousStart": "2026-05-01",
            "previousEnd": "2026-05-31",
        },
        "total": "184.50",
        "previousTotal": "145.00",
        "categories": [
            {
                "category": "Spesa alimentare",
                "total": "121.00",
                "previousTotal": "100.00",
                "difference": "21.00",
                "changePercent": 21.0,
                "count": 6,
            }
        ],
        "merchants": [
            {
                "id": "Mercato Aurora",
                "total": "121.00",
                "previousTotal": "100.00",
                "difference": "21.00",
                "changePercent": 21.0,
                "count": 6,
            }
        ],
        "items": [
            {"id": "Pasta del Borgo", "total": "18.00", "quantity": 6, "frequency": 3}
        ],
        "priceChanges": [],
    }
    prompt_payload = json.loads(json.dumps(payload or default_payload))
    prompt_payload.setdefault("totalRef", "total")
    prompt_payload.setdefault("totalAllowedEmphasis", ["current", "change"])
    prompt_payload.setdefault("totalSuggestionAllowed", True)
    collection_contracts = {
        "categories": ("category", ["current", "change"]),
        "merchants": ("merchant", ["current", "change"]),
        "items": ("item", ["current", "frequency"]),
        "priceChanges": ("price_change", ["current", "change"]),
    }
    for collection, (prefix, emphases) in collection_contracts.items():
        for index, entry in enumerate(prompt_payload.get(collection, [])):
            entry.setdefault("ref", f"{prefix}:{index}")
            entry.setdefault("allowedEmphasis", emphases)
            if collection == "items":
                allowed = entry.get("frequency", 0) >= 2
            else:
                previous = entry.get(
                    "previousAverage" if collection == "priceChanges" else "previousTotal"
                )
                allowed = previous not in {None, 0, "0", "0.00"} and (
                    entry.get("latest", entry.get("total")) != previous
                )
            entry.setdefault("suggestionAllowed", allowed)
    category_ids = {
        "Spesa alimentare": "food_grocery",
        "Groceries": "food_grocery",
        "Home": "home",
        "Lebensmittel": "food_grocery",
    }
    canonical = {
        collection: [
            {
                **entry,
                **(
                    {"id": category_ids.get(entry.get("category"), "other")}
                    if collection == "categories"
                    else {}
                ),
            }
            for entry in prompt_payload.get(collection, [])
        ]
        for collection in ("categories", "merchants", "items", "priceChanges")
    }
    snapshot = SimpleNamespace(
        locale=locale,
        model_dump=lambda **_kwargs: canonical,
    )
    provisional = EVAL.PreparedCase(
        case_id=case_id,
        snapshot=snapshot,
        prompt_payload=prompt_payload,
        expected_claims=(),
        fingerprint=f"fingerprint-{case_id}",
    )
    subjects = EVAL.build_subject_facts(provisional)
    preferred = [
        key for key in ("total", "category:food_grocery", "merchant:Mercato Aurora")
        if key in subjects
    ]
    if len(preferred) < 3:
        preferred.extend(key for key in subjects if key not in preferred)
    claims = tuple(
        {
            "subject": key,
            "metric": "current",
            "direction": subjects[key].direction,
        }
        for key in preferred[:3]
    )
    return EVAL.PreparedCase(
        case_id=case_id,
        snapshot=snapshot,
        prompt_payload=prompt_payload,
        expected_claims=claims,
        fingerprint=f"fingerprint-{case_id}",
    )


def score(case, output, other_cases=()):
    cases = [case, *other_cases]
    return EVAL.score_output(case, output, EVAL.build_entity_catalog(cases))


def score_selection(case, output):
    return EVAL.score_selection(case, output)


class FixtureTests(unittest.TestCase):
    def test_public_fixture_is_balanced_and_explicitly_synthetic(self):
        document = json.loads(FIXTURES.read_text(encoding="utf-8"))
        self.assertIs(document["synthetic"], True)
        self.assertEqual(15, len(document["cases"]))
        locales = {}
        for case in document["cases"]:
            locale = case["snapshot"]["locale"]
            locales[locale] = locales.get(locale, 0) + 1
            self.assertRegex(case["id"], r"^[a-z0-9_-]+$")
            self.assertEqual("EUR", case["snapshot"]["currency"])
            self.assertGreaterEqual(len(case["expectedClaims"]), 6)
            self.assertTrue(all(
                set(claim) == {"subject", "metric", "direction"}
                for claim in case["expectedClaims"]
            ))
        self.assertEqual(
            {"it-IT": 3, "en-GB": 3, "de-DE": 3, "es-ES": 3, "fr-FR": 3},
            locales,
        )

    def test_fixture_entities_are_only_the_declared_fictional_set(self):
        document = json.loads(FIXTURES.read_text(encoding="utf-8"))
        merchants = {
            merchant["id"]
            for case in document["cases"]
            for merchant in case["snapshot"]["merchants"]
        }
        self.assertEqual(
            {
                "Mercato Aurora", "Casa Chiara", "Northstar Market",
                "Blue Line Transit", "Morgenrot Markt", "Linden Apotheke",
                "Mercado Brisa", "Cafe Nube", "Tram Azur", "Atelier Lune",
                "Farmacia Cedro", "Bottega Iris", "Tavola Ginestra",
                "Bus Corallo", "Willow Workshop", "Silver Screen Room",
                "Pinecone Grocer", "Harbour Stage", "Wiesenladen",
                "Kupfer Haus", "Elbe Mobil", "Stern Atelier", "Ruta Coral",
                "Herbolario Lago", "Mesa Canela", "Taller Violeta",
                "Epicerie Aube", "Maison Sureau", "Marche Luciole",
                "Scene Mistral",
            },
            merchants,
        )

    def test_expected_claims_resolve_to_fixture_subjects_and_directions(self):
        class Snapshot:
            def __init__(self, value):
                self.value = value
                self.locale = value["locale"]

            @classmethod
            def model_validate(cls, value):
                return cls(value)

            def model_dump(self, **_kwargs):
                return self.value

        def prompt_data(snapshot):
            value = json.loads(json.dumps(snapshot.value))
            value["categories"] = [
                {"category": entry["id"], **{
                    key: child for key, child in entry.items() if key != "id"
                }}
                for entry in value["categories"]
            ]
            return json.dumps(value)

        cases = EVAL.validate_fixtures(
            FIXTURES,
            snapshot_type=Snapshot,
            prompt_data_builder=prompt_data,
        )
        self.assertEqual(15, len(cases))
        self.assertTrue(all(case.expected_claims for case in cases))


class ScoringTests(unittest.TestCase):
    def test_fully_grounded_concise_output_passes(self):
        case = prepared_case()
        result = score(
            case,
            {
                "observations": [
                    "La spesa totale è aumentata da 145,00 € a 184,50 € "
                    "rispetto al periodo precedente.",
                    "La Spesa alimentare è salita di 21,00 €, fino a 121,00 €.",
                    "Mercato Aurora è aumentato di 21,00 €, fino a 121,00 €.",
                ],
                "suggestion": "Controlla la Spesa alimentare, arrivata a 121,00 €.",
            },
        )
        self.assertEqual(1.0, result["strictPass"])
        self.assertEqual(1.0, result["factualGrounding"])
        self.assertEqual(1.0, result["languageMatch"])
        self.assertEqual(1.0, result["usefulFactCoverage"])
        self.assertGreaterEqual(result["quality"], 99.0)

    def test_three_current_values_without_insight_do_not_strict_pass(self):
        result = score(
            prepared_case(),
            {
                "observations": [
                    "La spesa totale è 184,50 €.",
                    "La Spesa alimentare è 121,00 €.",
                    "Mercato Aurora rappresenta 121,00 € della spesa.",
                ],
                "suggestion": None,
            },
        )
        self.assertEqual(0.0, result["strictPass"])
        self.assertLess(result["usefulFactCoverage"], 1.0)
        self.assertLess(result["quality"], 90.0)

    def test_amount_times_100_and_internal_category_id_are_hard_failures(self):
        case = prepared_case()
        result = score(
            case,
            {
                "observations": [
                    "La spesa food_grocery è aumentata a 12.100,00 € "
                    "rispetto al periodo precedente."
                ],
                "suggestion": None,
            },
        )
        self.assertEqual(0.0, result["numberGrounding"])
        self.assertEqual(0.0, result["entityGrounding"])
        self.assertIn("12100", result["diagnostics"]["ungroundedNumbers"])
        self.assertIn("food_grocery", result["diagnostics"]["foreignEntities"])
        self.assertLess(result["quality"], 15.0)

    def test_localized_times_100_amount_is_rejected_in_every_locale(self):
        examples = {
            "it-IT": "La spesa totale è 18.450,00 € rispetto al periodo precedente.",
            "en-GB": "Total spending is €18,450.00 compared with the previous period.",
            "de-DE": "Die Gesamtausgaben sind 18.450,00 € gegenüber der Vorperiode.",
            "es-ES": "El gasto total es 18.450,00 € respecto al periodo anterior.",
            "fr-FR": (
                "La dépense totale est de 18 450,00 € par rapport à la période "
                "précédente."
            ),
        }
        for locale, observation in examples.items():
            with self.subTest(locale=locale):
                result = score(
                    prepared_case(f"case-{locale[:2]}", locale),
                    {"observations": [observation], "suggestion": None},
                )
                self.assertEqual(0.0, result["numberGrounding"])
                self.assertIn("18450", result["diagnostics"]["ungroundedNumbers"])

    def test_known_values_swapped_between_subjects_are_hard_failure(self):
        case = prepared_case()
        result = score(
            case,
            {
                "observations": [
                    "La spesa totale è aumentata a 121,00 €.",
                    "La Spesa alimentare è salita a 184,50 €.",
                    "Mercato Aurora rappresenta 184,50 € della spesa.",
                ],
                "suggestion": None,
            },
        )
        self.assertEqual(0.0, result["claimAssociationGrounding"])
        self.assertEqual(0.0, result["strictPass"])
        self.assertGreaterEqual(len(result["diagnostics"]["misattributedClaims"]), 3)

    def test_period_date_next_to_total_is_not_a_misattributed_amount(self):
        result = score(
            prepared_case(),
            {
                "observations": [
                    "Dal 1 giugno 2026 la spesa totale è aumentata a 184,50 €."
                ],
                "suggestion": None,
            },
        )
        self.assertEqual(1.0, result["claimAssociationGrounding"])
        self.assertEqual([], result["diagnostics"]["misattributedClaims"])

    def test_wrong_comparison_direction_is_hard_failure(self):
        result = score(
            prepared_case(),
            {
                "observations": [
                    "La spesa totale è diminuita da 145,00 € a 184,50 €."
                ],
                "suggestion": None,
            },
        )
        self.assertEqual(0.0, result["directionGrounding"])
        self.assertEqual(0.0, result["strictPass"])

    def test_explicit_wrong_sign_is_a_direction_failure(self):
        result = score(
            prepared_case(),
            {
                "observations": [
                    "La spesa totale è 184,50 €, con una variazione di −39,50 €."
                ],
                "suggestion": None,
            },
        )
        self.assertEqual(0.0, result["directionGrounding"])

    def test_false_comparison_without_baseline_is_hard_failure(self):
        base = prepared_case().prompt_payload
        payload = {
            **base,
            "previousTotal": "0.00",
            "categories": [{
                **base["categories"][0],
                "previousTotal": "0.00",
                "difference": "121.00",
                "changePercent": None,
            }],
            "merchants": [{
                **base["merchants"][0],
                "previousTotal": "0.00",
                "difference": "121.00",
                "changePercent": None,
            }],
        }
        case = prepared_case("case-no-baseline", payload=payload)
        result = score(
            case,
            {
                "observations": [
                    "La spesa totale è aumentata da 0,00 € a 184,50 €."
                ],
                "suggestion": None,
            },
        )
        self.assertEqual(0.0, result["directionGrounding"])
        self.assertEqual("no_baseline", case.expected_claims[0]["direction"])

    def test_entity_from_another_fixture_is_hallucination(self):
        case = prepared_case()
        foreign = prepared_case(
            "case-en",
            "en-GB",
            {
                **case.prompt_payload,
                "locale": "en-GB",
                "merchants": [{"id": "Northstar Market", "total": "50.00"}],
            },
        )
        result = score(
            case,
            {
                "observations": [
                    "Northstar Market rappresenta 121,00 € della spesa."
                ],
                "suggestion": None,
            },
            [foreign],
        )
        self.assertEqual(0.0, result["entityGrounding"])
        self.assertIn("Northstar Market", result["diagnostics"]["foreignEntities"])

    def test_localized_english_label_equal_to_internal_id_is_allowed(self):
        base = prepared_case().prompt_payload
        case = prepared_case(
            "case-en-home",
            "en-GB",
            {
                **base,
                "locale": "en-GB",
                "categories": [{"category": "Home", "total": "121.00"}],
            },
        )
        result = score(
            case,
            {
                "observations": ["The Home category represents 121.00 EUR of spending."],
                "suggestion": None,
            },
        )
        self.assertEqual(1.0, result["entityGrounding"])
        self.assertNotIn("home", result["diagnostics"]["foreignEntities"])

    def test_wrong_language_is_penalized(self):
        case = prepared_case()
        result = score(
            case,
            {
                "observations": [
                    "The spending increased from 145.00 EUR to 184.50 EUR "
                    "compared with the previous period."
                ],
                "suggestion": None,
            },
        )
        self.assertEqual(0.0, result["languageMatch"])
        self.assertLess(result["quality"], 25.0)

    def test_terse_language_without_markers_is_inconclusive_not_failure(self):
        base = prepared_case().prompt_payload
        case = prepared_case(
            "case-de-terse",
            "de-DE",
            {
                **base,
                "locale": "de-DE",
                "categories": [{
                    **base["categories"][0],
                    "category": "Lebensmittel",
                }],
                "merchants": [{
                    **base["merchants"][0],
                    "id": "Wiesenladen",
                }],
            },
        )
        result = score(
            case,
            {"observations": ["Gesamt: 184,50 €."], "suggestion": None},
        )
        self.assertIsNone(result["languageMatch"])
        self.assertEqual(1.0, result["factualGrounding"])

    def test_suggestion_cannot_turn_existing_amount_into_future_limit(self):
        result = score(
            prepared_case(),
            {
                "observations": ["La spesa totale è 184,50 €."],
                "suggestion": (
                    "Imposta un budget di 121,00 € per la Spesa alimentare "
                    "il mese prossimo."
                ),
            },
        )
        self.assertEqual(0.0, result["suggestionSupported"])

    def test_generic_output_without_quantified_facts_cannot_score_high(self):
        case = prepared_case()
        result = score(
            case,
            {"observations": ["La spesa merita attenzione."], "suggestion": None},
        )
        self.assertEqual(0.0, result["quantifiedObservationCoverage"])
        self.assertEqual(0.0, result["usefulFactCoverage"])
        self.assertEqual(0.0, result["strictPass"])
        self.assertLessEqual(result["quality"], 35.0)

    def test_suggestion_must_reuse_input_evidence(self):
        case = prepared_case()
        result = score(
            case,
            {
                "observations": ["La spesa totale è 184,50 €."],
                "suggestion": "Valuta un budget più rigido.",
            },
        )
        self.assertEqual(0.0, result["suggestionSupported"])

    def test_more_than_three_observations_fails_length_contract(self):
        case = prepared_case()
        result = score(
            case,
            {
                "observations": ["La spesa totale è 184,50 €."] * 4,
                "suggestion": None,
            },
        )
        self.assertEqual(0.0, result["maxThreeObservations"])
        self.assertEqual(0.0, result["strictPass"])


class SelectionScoringTests(unittest.TestCase):
    def test_change_emphasis_covers_changing_salient_facts(self):
        result = score_selection(prepared_case(), {
            "observations": [
                {"ref": "total", "emphasis": "change"},
                {"ref": "category:0", "emphasis": "change"},
                {"ref": "merchant:0", "emphasis": "change"},
            ],
            "suggestionObservation": 0,
        })

        self.assertEqual(1.0, result["strictPass"])
        self.assertEqual(1.0, result["referenceValidity"])
        self.assertEqual(1.0, result["emphasisUtility"])
        self.assertEqual(1.0, result["usefulFactCoverage"])
        self.assertEqual(1.0, result["suggestionSupported"])

    def test_current_emphasis_is_valid_but_not_useful_for_a_change(self):
        result = score_selection(prepared_case(), {
            "observations": [
                {"ref": "total", "emphasis": "current"},
                {"ref": "category:0", "emphasis": "current"},
                {"ref": "merchant:0", "emphasis": "current"},
            ],
            "suggestionObservation": None,
        })

        self.assertEqual(1.0, result["referenceValidity"])
        self.assertEqual(0.0, result["emphasisUtility"])
        self.assertEqual(0.0, result["usefulFactCoverage"])
        self.assertEqual(0.0, result["strictPass"])

    def test_suggestion_must_link_to_an_actionable_selected_ref(self):
        linked = score_selection(prepared_case(), {
            "observations": [{"ref": "total", "emphasis": "change"}],
            "suggestionObservation": 0,
        })
        unsupported = score_selection(prepared_case(), {
            "observations": [{"ref": "total", "emphasis": "current"}],
            "suggestionObservation": 0,
        })

        self.assertEqual(1.0, linked["suggestionSupported"])
        self.assertEqual(0.0, unsupported["suggestionSupported"])


class HarnessTests(unittest.TestCase):
    def test_plan_mode_is_safe_and_does_not_require_backend_dependencies(self):
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--high-model", "gpt-5.6-terra"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        plan = json.loads(completed.stdout)
        self.assertEqual("plan-only", plan["mode"])
        self.assertIn("gpt-5.6-terra", plan["requestedHighModels"])
        self.assertIn("No fixture", plan["note"])

    def test_real_call_requires_both_explicit_gates(self):
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--run"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(2, completed.returncode)
        self.assertIn("require both", completed.stderr)

    def test_schedule_uses_catalog_and_adds_only_selected_high_round(self):
        cases = [prepared_case("one"), prepared_case("two")]
        schedule, skipped = EVAL.build_schedule(
            cases,
            ["gpt-5.6-sol", "gpt-5.6-terra"],
            ["gpt-5.6-terra"],
        )
        self.assertEqual(10, len(schedule))
        self.assertEqual(2, sum(effort == "high" for _case, _model, effort in schedule))
        self.assertEqual(
            [
                ("one", "gpt-5.6-sol", "low"),
                ("one", "gpt-5.6-terra", "low"),
                ("one", "gpt-5.6-sol", "medium"),
                ("one", "gpt-5.6-terra", "medium"),
                ("two", "gpt-5.6-terra", "medium"),
                ("two", "gpt-5.6-sol", "medium"),
                ("two", "gpt-5.6-terra", "low"),
                ("two", "gpt-5.6-sol", "low"),
                ("one", "gpt-5.6-terra", "high"),
                ("two", "gpt-5.6-terra", "high"),
            ],
            [(case.case_id, model, effort) for case, model, effort in schedule],
        )
        self.assertEqual(
            [{
                "model": "gpt-5.6-luna",
                "reasoningEffort": "low",
                "reason": "not_in_account_catalog",
            }, {
                "model": "gpt-5.6-luna",
                "reasoningEffort": "medium",
                "reason": "not_in_account_catalog",
            }],
            skipped,
        )

    def test_schedule_interleaves_and_rotates_multiple_high_models(self):
        cases = [prepared_case(value) for value in ("one", "two", "three")]
        schedule, _skipped = EVAL.build_schedule(
            cases,
            ["gpt-5.6-sol", "gpt-5.6-terra"],
            ["gpt-5.6-sol", "gpt-5.6-terra"],
        )

        high = [
            (case.case_id, model)
            for case, model, effort in schedule
            if effort == "high"
        ]
        self.assertEqual(high, [
            ("one", "gpt-5.6-sol"),
            ("one", "gpt-5.6-terra"),
            ("two", "gpt-5.6-terra"),
            ("two", "gpt-5.6-sol"),
            ("three", "gpt-5.6-sol"),
            ("three", "gpt-5.6-terra"),
        ])

    def test_transient_retry_is_bounded(self):
        class TimeoutException(Exception):
            pass

        attempts = 0
        sleeps = []

        async def operation():
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise TimeoutException("temporary")
            return "ok"

        async def sleep(delay):
            sleeps.append(delay)

        result, call_count = asyncio.run(
            EVAL.call_with_retry(
                operation,
                transient_retries=1,
                retry_base_seconds=0.25,
                sleep=sleep,
            )
        )
        self.assertEqual("ok", result)
        self.assertEqual(2, call_count)
        self.assertEqual([0.25], sleeps)

    def test_provider_response_failure_is_infrastructure_not_quality(self):
        info = EVAL.classify_error(RuntimeError("provider returned no output"))
        self.assertEqual("provider_response", info.category)
        self.assertIs(info.retryable, True)
        self.assertNotIn(info.category, EVAL.MODEL_QUALITY_ERROR_CATEGORIES)
        metrics = EVAL.failure_metrics(
            counts_against_quality=info.category in EVAL.MODEL_QUALITY_ERROR_CATEGORIES
        )
        self.assertIsNone(metrics["quality"])
        self.assertIsNone(metrics["strictPass"])

    def test_configuration_value_error_is_not_model_quality(self):
        info = EVAL.classify_error(ValueError("Unsupported reasoning effort"))
        self.assertEqual("configuration", info.category)
        self.assertNotIn(info.category, EVAL.MODEL_QUALITY_ERROR_CATEGORIES)

    def test_provider_preflight_checks_connection_and_catalog(self):
        class Service:
            async def account_status(self):
                return {"connected": True, "planType": "synthetic-test"}

            async def list_models(self):
                return [{"id": "gpt-5.6-terra"}]

        state, catalog = asyncio.run(
            EVAL.provider_preflight(
                Service(), transient_retries=0, retry_base_seconds=0
            )
        )
        self.assertNotIn("planType", state)
        self.assertIs(state["connected"], True)
        self.assertEqual([{"id": "gpt-5.6-terra"}], catalog)

    def test_checkpoint_is_private_and_resumable(self):
        row = {
            "status": "ok",
            "caseFingerprint": "case-fingerprint",
            "model": "gpt-5.6-terra",
            "reasoningEffort": "medium",
        }
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "checkpoint.json"
            EVAL.atomic_write_json(
                output,
                {
                    "formatVersion": EVAL.FORMAT_VERSION,
                    "evaluationFingerprint": "evaluation-fingerprint",
                    "createdAt": "2026-08-12T00:00:00Z",
                    "results": [row],
                },
            )
            self.assertEqual(0o600, stat.S_IMODE(output.stat().st_mode))
            created_at, rows = EVAL.load_resume_results(
                output,
                evaluation_fingerprint="evaluation-fingerprint",
                restart=False,
            )
        self.assertEqual("2026-08-12T00:00:00Z", created_at)
        self.assertEqual(row, rows[("case-fingerprint", "gpt-5.6-terra", "medium")])

    def test_paired_comparison_reports_win_tie_loss_on_common_cases(self):
        rows = []
        for fingerprint, left_strict, left_quality, right_strict, right_quality in (
            ("a", 1.0, 80.0, 0.0, 90.0),
            ("b", 1.0, 70.0, 1.0, 70.2),
            ("c", 0.0, 20.0, 0.0, 22.0),
        ):
            rows.extend(
                [
                    {
                        "model": "gpt-5.6-sol",
                        "reasoningEffort": "low",
                        "caseFingerprint": fingerprint,
                        "strictPass": left_strict,
                        "quality": left_quality,
                    },
                    {
                        "model": "gpt-5.6-terra",
                        "reasoningEffort": "medium",
                        "caseFingerprint": fingerprint,
                        "strictPass": right_strict,
                        "quality": right_quality,
                    },
                ]
            )
        paired = EVAL.paired_comparisons(rows)
        comparison = paired["comparisons"][0]
        self.assertEqual(3, comparison["pairedCases"])
        self.assertIs(comparison["eligibleForSelection"], False)
        self.assertIs(paired["automaticWinner"], False)
        self.assertEqual((1, 1, 1), (
            comparison["leftWins"], comparison["ties"], comparison["rightWins"]
        ))

    def test_paired_selection_guard_rejects_infrastructure_gap(self):
        rows = []
        for index in range(10):
            fingerprint = f"case-{index}"
            rows.extend(
                [
                    {
                        "model": "gpt-5.6-sol",
                        "reasoningEffort": "low",
                        "caseFingerprint": fingerprint,
                        "strictPass": 1.0,
                        "quality": 90.0,
                    },
                    {
                        "model": "gpt-5.6-terra",
                        "reasoningEffort": "medium",
                        "caseFingerprint": fingerprint,
                        "strictPass": 1.0,
                        "quality": None if index == 9 else 89.0,
                    },
                ]
            )
        scheduled = {
            (f"case-{index}", model, effort)
            for index in range(10)
            for model, effort in (
                ("gpt-5.6-sol", "low"),
                ("gpt-5.6-terra", "medium"),
            )
        }
        comparison = EVAL.paired_comparisons(rows, scheduled)["comparisons"][0]
        self.assertEqual(10, comparison["expectedCommonCases"])
        self.assertEqual(9, comparison["pairedCases"])
        self.assertIs(comparison["eligibleForSelection"], False)

    def test_paired_selection_uses_full_schedule_when_a_row_is_missing(self):
        rows = []
        scheduled = set()
        for index in range(15):
            fingerprint = f"case-{index}"
            for model, effort in (
                ("gpt-5.6-sol", "low"),
                ("gpt-5.6-terra", "medium"),
            ):
                scheduled.add((fingerprint, model, effort))
                if model == "gpt-5.6-terra" and index == 14:
                    continue
                rows.append({
                    "model": model,
                    "reasoningEffort": effort,
                    "caseFingerprint": fingerprint,
                    "strictPass": 1.0,
                    "quality": 90.0,
                })
        comparison = EVAL.paired_comparisons(rows, scheduled)["comparisons"][0]
        self.assertEqual(15, comparison["expectedCommonCases"])
        self.assertEqual(14, comparison["pairedCases"])
        self.assertIs(comparison["eligibleForSelection"], False)

    def test_build_output_ignores_resume_rows_outside_current_schedule(self):
        case = prepared_case("one")
        active_key = (case.fingerprint, "gpt-5.6-terra", "medium")
        surplus_key = (case.fingerprint, "gpt-5.6-terra", "high")

        def row(effort):
            return {
                "status": "ok",
                "attempts": 1,
                "model": "gpt-5.6-terra",
                "reasoningEffort": effort,
                "caseFingerprint": case.fingerprint,
                "caseId": case.case_id,
                "quality": 90.0,
                "strictPass": 1.0,
                "latencyMs": 1,
            }

        output = EVAL.build_output(
            created_at="2026-08-12T00:00:00Z",
            evaluation_fingerprint="eval",
            contract_hash="contract",
            cases=[case],
            provider={"connected": True},
            available_models=["gpt-5.6-terra"],
            high_models=[],
            skipped=[],
            scheduled_keys={active_key},
            results={active_key: row("medium"), surplus_key: row("high")},
        )
        self.assertEqual(1, len(output["results"]))
        self.assertEqual("medium", output["results"][0]["reasoningEffort"])

    def test_harness_calls_the_production_insight_provider_flow(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("OpenAISubscriptionProvider", source)
        self.assertIn("adapter.select_insights(case.snapshot)", source)
        self.assertIn("prompt_builder=build_insight_prompt", source)
        self.assertIn("prompt_data_builder=insight_prompt_data", source)

    def test_contract_fingerprint_tracks_internal_schema_and_renderer(self):
        case = prepared_case()

        def prompt_builder(_snapshot):
            return SimpleNamespace(instructions="trusted", user_input="{}")

        base = {
            "cases": [case],
            "prompt_builder": prompt_builder,
            "selection_schema": {"type": "object", "required": ["observations"]},
            "public_output_schema": {"type": "object"},
            "renderer_material": {"version": "one", "copy": {"current": "x"}},
            "base_instructions": "base",
        }
        original = EVAL.contract_fingerprint(**base)[0]
        changed_schema = EVAL.contract_fingerprint(
            **{**base, "selection_schema": {"type": "object", "required": ["changed"]}}
        )[0]
        changed_renderer = EVAL.contract_fingerprint(
            **{**base, "renderer_material": {"version": "two", "copy": {"current": "x"}}}
        )[0]

        self.assertNotEqual(original, changed_schema)
        self.assertNotEqual(original, changed_renderer)


if __name__ == "__main__":
    unittest.main()
