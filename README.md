# Bianco

**Receipts in. Clarity out.**

Bianco is a self-hosted, mobile-first PWA for capturing, understanding, and
organizing receipts. It stays useful offline, syncs automatically when the
server is available, and keeps your data under your control.

## Highlights

- Offline-first capture and browsing
- Automatic, transparent synchronization
- AI extraction through OpenAI, Ollama, or any OpenAI-compatible endpoint
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

# Generate the password hash, then paste it into .env inside single quotes.
docker run --rm -it caddy:2.11.4-alpine caddy hash-password

# Set distinct random values for BIANCO_SYNC_TOKEN and BIANCO_SECRET_KEY.
docker compose up -d --build
```

Open [http://localhost](http://localhost) and sign in with the credentials from
your `.env` file. For a public deployment, set `BIANCO_SITE_ADDRESS` to a domain
served over HTTPS. Rootless runtimes can use unprivileged host ports such as
`8080` and `8443`.

## AI providers

Configure AI from **Settings → Artificial intelligence**. Bianco validates the
endpoint, discovers its models, and activates the selected model immediately.
Provider API keys are encrypted on the server and are never stored in the
browser.

Ollama is an external service: Bianco connects to an existing instance but does
not install Ollama or download models for you. The API container must be able to
reach the configured endpoint.

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
./scripts/backup.sh ./backups/bianco.sqlite
./scripts/restore.sh ./backups/bianco.sqlite
```

Keep backups and `BIANCO_SECRET_KEY` together securely: the same key is required
to decrypt saved provider credentials after a restore.

## Security

Use Bianco behind HTTPS or on a trusted private network/VPN. Choose long,
independent secrets, protect `.env`, keep dependencies updated, and never expose
the FastAPI service directly to the internet.

## License

[MIT](LICENSE)
