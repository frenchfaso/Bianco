# Bianco

**Receipts in. Clarity out.**

Bianco is a self-hosted, mobile-first PWA for capturing, understanding, and
organizing receipts. It stays useful offline, syncs automatically when the
server is available, and keeps your data under your control.

## Highlights

- Offline-first capture and browsing
- Conservative WebGPU-accelerated crop and perspective correction, with safe CPU fallback
- WebP receipt storage when supported, with JPEG fallback
- Automatic, transparent synchronization
- AI extraction through a ChatGPT/Codex subscription, Ollama, or any OpenAI-compatible endpoint
- Optional audited Ollama pipeline with Qwen, GLM-OCR, and Gemma
- Persistent server-side AI queue that keeps working after the app is closed
- Fully editable receipts and line items
- Light and dark themes, with English, Italian, German, Spanish, and French
- No analytics, trackers, or mandatory cloud account

## Quick start

You only need Git, Docker, and Docker Compose.

```bash
git clone https://github.com/frenchfaso/Bianco.git
cd Bianco
cp .env.example .env

# Generate an Argon2 password hash and paste it into .env.
./scripts/hash-password.sh

# Set distinct random values for BIANCO_SYNC_TOKEN and BIANCO_SECRET_KEY.
chmod 600 .env
docker compose up -d --build
```

Open [http://localhost:8080](http://localhost:8080) and sign in with the
credentials from your `.env` file. Bianco binds to `127.0.0.1` by default so a
local HTTPS reverse proxy can expose it without also leaving a plain HTTP port
open on the network.

The production login uses a signed, `HttpOnly`, `SameSite=Strict` session
cookie. Keep `BIANCO_SESSION_COOKIE_SECURE=true` whenever Bianco is exposed over
HTTPS; set it to `false` only for an explicitly local plain-HTTP deployment.

## AI providers

Configure providers from **Settings → Artificial intelligence**. OpenAI uses the
ChatGPT device-login flow also used by OpenCode and Pi, then accesses the Codex models
included with your ChatGPT plan directly over HTTPS. No Codex runtime is installed, and
it never uses an OpenAI API key or API billing. OAuth credentials remain in the
backend data volume, never in the PWA, while the available model list comes from
the connected account. Receipt extraction and spending insights can use separate
backend-only models and reasoning efforts; the PWA only exposes the provider
connection. This is the same Codex login and transport family used by
established open-source clients, implemented as a small compatibility adapter rather
than through the Codex runtime. Because that transport is not an OpenAI API Platform
contract, the adapter remains experimental: an upstream change can require a Bianco
update. OpenAI-compatible provider keys are encrypted server-side.

Ollama is an external service: Bianco connects to an existing instance but does
not install Ollama or download models for you. The API container must be able to
reach the configured endpoint. Set `OLLAMA_MODEL`, `OLLAMA_OCR_MODEL`, and
`OLLAMA_AUDIT_MODEL` to enable the selected Qwen → GLM-OCR → Gemma receipt
pipeline; leaving either secondary model blank keeps the direct single-model flow.
`OLLAMA_INSIGHT_MODEL` optionally routes summaries to another local model and
falls back to `OLLAMA_MODEL`. `OPENAI_COMPATIBLE_INSIGHT_MODEL` behaves the same
way for an OpenAI-compatible backend.
The Codex login is intentionally not part of SQLite backups; reconnect ChatGPT
after restoring Bianco onto a different server.

## Development

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

The development UI is available at [http://localhost:5173](http://localhost:5173).
Run the production-stack smoke test with:

```bash
./scripts/smoke-test.sh
```

## Backups

```bash
./scripts/backup.sh ./backups/bianco.tar.gz
./scripts/restore.sh ./backups/bianco.tar.gz
```

The versioned archive contains a consistent SQLite snapshot, receipt images, and
checksums. Keep backups and `BIANCO_SECRET_KEY` together securely: the same key
is required to decrypt saved provider credentials after a restore. ChatGPT device
credentials are intentionally excluded and must be reconnected on a new server.
Use `BIANCO_OPENAI_RECEIPT_MODEL` and `BIANCO_OPENAI_INSIGHT_MODEL` to route the
two workloads independently. Their corresponding
`BIANCO_OPENAI_*_REASONING_EFFORT` settings default to `medium`; change them only
after representative evals. The legacy `BIANCO_OPENAI_REASONING_EFFORT` remains a
common fallback for existing deployments.

To inspect receipt image files that are no longer referenced, run the safe dry-run:

```bash
docker compose exec api python -m app.cli.gc_images --retention-days 30
```

Review the reported counts and bytes, then repeat with `--delete` to remove eligible
files. Symlinks and malformed paths are never deleted.

## Security

Use Bianco behind HTTPS. For example, Tailscale Serve can securely publish the
default listener inside your tailnet:

```bash
sudo tailscale serve --bg http://127.0.0.1:8080
```

Set `BIANCO_BIND_ADDRESS=0.0.0.0` only when direct network access is explicitly
required and protected by a trusted TLS setup. Choose long, independent secrets,
use a strong login password, protect `.env`, keep dependencies updated, and never
expose the FastAPI service directly to the internet. Caddy delegates access
checks to FastAPI with its native `forward_auth` directive; the API container
remains private to the Compose network.

Bianco keeps an offline copy in the browser. A normal sign-out closes the server
session but deliberately leaves that copy available for offline use. On a shared or
lost device, use **Sign out and remove data from this device**; browser-profile and
device-level access controls remain part of the local security boundary.

## License

[MIT](LICENSE)
