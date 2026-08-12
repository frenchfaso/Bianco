# GPT-5.6 insight evaluation

This harness compares Bianco's spending-insight selections across GPT-5.6 Sol,
Terra, and Luna. It deliberately calls the production
`OpenAISubscriptionProvider.select_insights()` path and then the deterministic
production renderer, so every configuration sees the same prompt, localized
category labels, major-unit amounts, strict selection schema, renderer, and
ChatGPT-subscription transport.

The protocol follows OpenAI's guidance to compare reasoning efforts on the same
representative tasks instead of assuming that more reasoning is always better:

- [GPT-5.6 model and prompting guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## Public synthetic fixtures

`gpt56_insight_fixtures.json` contains 15 invented aggregate snapshots: three
scenarios in each supported locale (`it-IT`, `en-GB`, `de-DE`, `es-ES`, `fr-FR`).
They cover increases or decreases, periods without a previous baseline, category
mix changes, recurring items, merchant distribution, and price changes. Merchant
and item names are fictional; the file contains no receipt image, label, or
personal data from Bianco's private corpus.

Each case also declares an `expectedClaims` allow-list. A claim identifies a
salient production subject (overall total, localized category, merchant, item, or
price change), its current-value metric, and the direction implied by the snapshot.
Preflight resolves every declaration against the exact serialized production
payload and rejects stale subjects or directions. The scorer maps these claims to
the opaque references that the model can select; the declarations are part of the
evaluation fingerprint.

The base matrix is Sol, Terra, and Luna at `low` and `medium`, subject to the live
account catalog. Repeat `--high-model` to add a `high` round only for selected
candidates.

## Safety and execution

Plan mode does not import backend dependencies, read fixtures or credentials, or
make a provider request:

```sh
python3 scripts/eval_gpt56_insights.py
```

A real run requires both explicit usage gates. It validates all fixtures against
the production `InsightSnapshot`, performs the ChatGPT account and model-catalog
preflight, then checkpoints atomically after each case:

```sh
python3 scripts/eval_gpt56_insights.py \
  --output dataset/results/gpt56-insights.json \
  --run --accept-subscription-usage
```

On Karonte, use a one-off API container to reuse the deployed dependencies,
encrypted OAuth credential, and secret key. Run it while Bianco's AI queue is
empty so two processes do not refresh the same OAuth credential concurrently:

```sh
cd ~/Code/Bianco
docker compose run --rm --no-deps \
  -v "$PWD/scripts:/work/scripts:ro" \
  -v "$PWD/server:/work/server:ro" \
  -v "$PWD/dataset/gpt56_insight_fixtures.json:/work/dataset/gpt56_insight_fixtures.json:ro" \
  -w /work api \
  python scripts/eval_gpt56_insights.py \
  --fixtures /work/dataset/gpt56_insight_fixtures.json \
  --output /data/evals/gpt56-insights.json \
  --run --accept-subscription-usage
```

After reviewing the six base configurations, a selective quality-first round can
resume the same checkpoint:

```sh
docker compose run --rm --no-deps \
  -v "$PWD/scripts:/work/scripts:ro" \
  -v "$PWD/server:/work/server:ro" \
  -v "$PWD/dataset/gpt56_insight_fixtures.json:/work/dataset/gpt56_insight_fixtures.json:ro" \
  -w /work api \
  python scripts/eval_gpt56_insights.py \
  --fixtures /work/dataset/gpt56_insight_fixtures.json \
  --output /data/evals/gpt56-insights.json \
  --high-model gpt-5.6-terra \
  --run --accept-subscription-usage
```

Use `--rerun-failures` to retain successes and retry failed rows. Use `--restart`
only to discard an existing compatible checkpoint. A changed fixture, production
prompt, schema, base instruction, or scoring contract is rejected against an old
output. Authentication and configuration errors stop the run; transient transport,
timeout, rate-limit, provider-5xx, and incomplete provider-stream failures receive
bounded retries. Provider/transport failures remain unscored; schema or JSON
validation failures count as model-quality failures.
The private `0600` checkpoint contains each model's structured selection, the
deterministically rendered text, and score diagnostics so a human can audit the
results. It contains no OAuth token, account ID, plan type, source receipt, or
private corpus data; do not replace the synthetic fixture with user data before
deciding an appropriate retention policy.

## Reading the result

The deterministic scorer evaluates the model's structured decision before prose is
rendered. It checks:

- exact schema adherence, unique references, and the three-observation limit;
- whether every selected reference exists in the production payload and supports
  the requested `current`, `change`, or `frequency` emphasis;
- whether the chosen emphasis is useful for that evidence, for example `change`
  only when a comparison baseline exists;
- coverage of up to three salient references declared by `expectedClaims`;
- whether `suggestionObservation` points to selected evidence explicitly eligible
  for a change or recurring-purchase suggestion.

Unknown references or unsupported emphasis choices receive a hard quality penalty.
`rendererValid` separately records whether the same selection passes the production
renderer; the saved `output` is deterministic and is not rescored as model prose.
Consequently, numeric formatting, locale, category localization, and prevention of
the historical amount-times-100 error are renderer invariants covered by backend
tests and the evaluation fingerprint, not model-quality degrees of freedom.
Infrastructure failures remain distinct from model-quality failures.

Do not choose from means alone. The `paired.comparisons` section reports
win/tie/loss counts on identical case fingerprints for every configuration pair.
A strict contract pass wins first; otherwise quality differences within 0.5 points
are ties. The harness never declares a winner automatically: a comparison is marked
eligible only with at least 10 pairs and no missing numeric result in the common
cases from the full scheduled matrix. Resume rows outside the current schedule are
ignored in summaries and pairing. Prefer consistent groundedness and paired wins,
then useful-fact coverage; use latency only as a secondary signal because insights
run on the backend.

This scorer establishes selection quality and contract adherence. The model never
writes merchant names, amounts, directions, or advice text; those come from trusted
snapshot data and deterministic localized templates. Before selecting a winner,
perform a blind human audit of every candidate's 15 rendered outputs for relevance,
non-repetition, and whether the selected evidence produces genuinely useful advice;
hide model and effort labels during that review. Fifteen synthetic cases are enough
for a controlled first selection, but not a permanent benchmark: preserve the
protocol and expand it with newly observed, privacy-safe failure modes.
