# Receipt extraction dataset

This directory contains receipt photographs and manually reviewed ground-truth
extractions for evaluating Bianco's AI provider pipeline.

`labels.json` uses the exact `ReceiptExtraction` JSON contract from
`server/app/schemas/ai.py`. It currently covers 17 receipts: seven already cropped
images and ten uncropped phone photographs. Amounts are integer euro cents.

Labeling conventions:

- transcription follows the visible receipt and does not expand uncertain text;
- `subtotalMinor` is populated only when a subtotal is explicitly printed;
- `discountMinor` is the positive sum of explicitly printed discounts;
- item prices are the gross prices printed on the product lines, before receipt-level discounts;
- `taxMinor` follows the printed `DI CUI IVA` value, including an explicit zero;
- `confidence` is `null`, because confidence is a model estimate rather than ground truth;
- warnings are empty unless the receipt itself makes a material field impossible to label;
- payment-card data, fiscal identifiers and loyalty-card numbers are intentionally excluded.

Generate the browser-native geometry preprocessing dataset from the repository root:

```sh
node scripts/preprocess_receipts.mjs
```

The command runs the same `client/src/images/document-preprocess.js` module that can
be imported by the PWA. It uses modern browser APIs only, binds its temporary test
server to `127.0.0.1`, keeps originals untouched and writes the 3200 px profile to
`dataset/processed/geometry-3200`.

Run the standalone benchmark with a Python environment containing the server
requirements:

```sh
PYTHONPATH=server python scripts/benchmark_ollama_receipts.py \
  --base-url http://127.0.0.1:11434 \
  --dataset dataset/processed/geometry-3200 \
  --models qwen3.5:9b-q8_0 gemma4:12b-it-q8_0 \
    gemma4:26b-a4b-it-qat minicpm-v4.5:8b \
  --prompt-variant v2 \
  --repair-invalid \
  --repair-strategy v3-reextract
```

Reproduce the selected flow with:

```sh
PYTHONPATH=server python scripts/benchmark_ollama_receipts.py \
  --base-url http://127.0.0.1:11434 \
  --dataset dataset/processed/geometry-3200 \
  --models qwen3.5:9b-q8_0 \
  --prompt-variant v2 \
  --prompt-role user \
  --no-think \
  --temperature 0 \
  --repair-invalid \
  --repair-strategy v3-reextract \
  --normalize-discount-items \
  --audit-all \
  --ocr-audit-model glm-ocr:latest \
  --audit-model gemma4:12b-it-q8_0 \
  --audit-prompt-role user \
  --audit-prompt-variant current \
  --audit-think \
  --audit-temperature 0 \
  --audit-num-ctx 16384 \
  --audit-num-predict 8192
```

The harness reuses Bianco's Pydantic schema and Ollama wire contract and supports
isolated prompt-role, thinking, sampling, image, OCR-first, frozen-auditor and
multi-pass experiments. It does not access Bianco's database or enqueue production jobs.
Generated reports, processed images and source receipt photographs remain ignored
by Git.
