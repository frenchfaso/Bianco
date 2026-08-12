# GPT-5.6 receipt evaluation

OpenAI's current guidance recommends lean, outcome-focused prompts, Structured
Outputs, an explicit reasoning effort, and evaluation on representative data.
Bianco therefore compares the same production prompt and schema across the three
GPT-5.6 tiers instead of adding model-specific instructions.

Reviewed official guidance:

- [GPT-5.6 model and prompting guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

The base matrix uses `low` and `medium` for every GPT-5.6 model present in the
connected account's live catalog. `medium` is the balanced baseline suggested in
the official guidance; `low` tests whether the same quality is available with less
reasoning. A quality-first `high` round is opt-in and runs only after the base
matrix for explicitly selected, catalog-visible models. Never infer account access
from the model name.

## Safety and reproducibility

Plan mode imports no backend dependency, reads neither the dataset nor OAuth
credentials, and makes no network request:

```sh
python3 scripts/eval_gpt56_receipts.py
```

A real run requires both cost gates. Before the first model request, it validates
all labels and images, confirms the ChatGPT connection, and fetches the live model
catalog. Credentials stay encrypted in the backend data directory; results never
contain tokens or raw model output.

Use the production-equivalent, geometry-corrected 3200 px images. Using the source
photos would benchmark a different pipeline:

```sh
python3 scripts/eval_gpt56_receipts.py \
  --dataset dataset \
  --image-root dataset/processed/geometry-3200 \
  --output dataset/results/gpt56-base.json \
  --run --accept-subscription-usage
```

The output is checkpointed with an atomic replace after every case. Re-running the
same command resumes compatible rows; `--rerun-failures` keeps successes and retries
failed rows. A changed dataset, production prompt, system instruction, or schema is
rejected against an old output. Choose a new output path, or deliberately replace
it with `--restart`.

On Karonte, run the harness in a one-off API container so it reuses the installed
backend dependencies, encrypted OAuth credentials, and `BIANCO_SECRET_KEY`, while
the private dataset remains a read-only bind mount. Start it only while Bianco's AI
queue is empty, to avoid two processes refreshing the same subscription token:

```sh
cd ~/Code/Bianco
docker compose run --rm --no-deps \
  -v "$PWD:/work:ro" -w /work api \
  python scripts/eval_gpt56_receipts.py \
  --dataset /work/dataset \
  --image-root /work/dataset/processed/geometry-3200 \
  --output /data/evals/gpt56-base.json \
  --run --accept-subscription-usage
```

Copy the private report back into the ignored results directory if needed:

```sh
mkdir -p dataset/results
docker compose exec -T api \
  sh -c 'cat /data/evals/gpt56-base.json' \
  > dataset/results/gpt56-base.json
```

After reviewing the base result, add one or more selected high-effort rounds. For
example, to test Terra without discarding completed base rows:

```sh
python3 scripts/eval_gpt56_receipts.py \
  --dataset dataset \
  --image-root dataset/processed/geometry-3200 \
  --output dataset/results/gpt56-base.json \
  --high-model gpt-5.6-terra \
  --run --accept-subscription-usage
```

Repeat `--high-model` to compare more than one tier. A requested model absent from
the account catalog is recorded as skipped and receives no request. The default is
one retry only for timeouts, transport failures, rate limits, and provider 5xx
responses; authentication, rejected requests, unavailable models, and invalid
structured output are not blindly retried. A rejected model/effort configuration is
stopped after its first classified failure; an authentication or configuration
failure stops the full run while preserving its checkpoint.

## Reading the result

Purchased lines are matched one-to-one by normalized names only. Prices, quantity,
and category are measured after matching, so a correct amount cannot bias which
line gets paired. Missing ground-truth values are marked not applicable instead of
being rewarded as `null == null`; the receipt-level compatibility category is not
scored. A payment-only document receives zero recall and precision when the model
invents article lines.

The report includes schema validity, merchant similarity, independently reported
header fields, exact total, line recall/precision, name similarity, exact total and
unit prices, exact quantity and item category, detailed per-metric means, latency,
attempts, success rate, and categorized failures. Invalid model output receives
zero effective quality. Authentication, network and provider availability failures
remain visible but do not masquerade as model-quality zeros.

Choose a configuration primarily from schema validity, total, line-price accuracy,
and recall. Use latency as a secondary signal because Bianco processes receipts in
the backend queue. Seventeen receipts are useful for selection but still a small
sample: re-run the unchanged protocol as the labelled set grows, and do not choose
from a single receipt or subjective inspection.
