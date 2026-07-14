# Bianco

Bianco è una PWA mobile-first, local-first e offline-first per acquisire,
correggere e analizzare scontrini. RxDB nel browser è la fonte primaria; il
backend FastAPI aggiunge sincronizzazione opzionale, backup e analisi tramite
provider OpenAI-compatible o Ollama. L'interfaccia usa Pico CSS incluso nella
build locale, senza dipendenze da CDN.

## Avvio rapido

Sono richiesti soltanto Docker (o un runtime compatibile), Docker Compose e
Git. Node.js, Python e SQLite non devono essere installati sull'host.

```bash
cp .env.example .env
# Impostare almeno BIANCO_SYNC_TOKEN con un segreto lungo.
docker compose up -d --build
```

Aprire `http://localhost`, quindi inserire lo stesso token in **Impostazioni →
Sincronizzazione**. Per un deployment pubblico impostare
`BIANCO_SITE_ADDRESS` a un dominio HTTPS gestito da Caddy.
Con runtime container rootless, impostare `BIANCO_HTTP_PORT` e
`BIANCO_HTTPS_PORT` a porte host non privilegiate (per esempio 8080/8443).

## Sviluppo

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

La PWA è su `http://localhost:5173`; Vite inoltra `/api` al container API. I
dati di sviluppo risiedono in `./data`.

## Test

```bash
docker compose -f compose.test.yaml run --rm client-test
docker compose -f compose.test.yaml run --rm api-test
docker compose -f compose.test.yaml run --rm e2e-test
```

Lo smoke test completo usa lo stack di produzione:

```bash
./scripts/smoke-test.sh
```

## Backup e ripristino server

Il backup usa l'API SQLite, quindi include in modo coerente lo stato WAL:

```bash
./scripts/backup.sh ./backups/bianco.sqlite
./scripts/restore.sh ./backups/bianco.sqlite
```

Il ripristino arresta l'API, sostituisce il database tramite il comando CLI
interno e riavvia il servizio. Conservare backup e token in un luogo protetto.

## Configurazione AI

Per un provider OpenAI-compatible:

```env
BIANCO_AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

Per un'istanza Ollama gestita esternamente a Bianco:

```env
BIANCO_AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://192.168.1.100:11434
OLLAMA_MODEL=qwen3.5:9b-q8_0
```

Bianco non installa, avvia o configura Ollama e non scarica modelli. L'URL e il
modello devono riferirsi a un'istanza già disponibile e raggiungibile dal
container API.

Le chiavi restano nel container API. Il client invia le fotografie soltanto al
backend configurato; l'endpoint AI non le conserva.

## Architettura e limiti MVP

- Tutte le modifiche utente vengono prima salvate in RxDB/Dexie.
- `receipts` e `receipt_items` usano replica incrementale con checkpoint server.
- Immagini e thumbnail sono attachment locali e vengono sincronizzate fuori
  dai payload JSON.
- Gli aggiornamenti live SSE trasportano soltanto il segnale `RESYNC`.
- I conflitti usano last-write-wins: prima `updatedAt`, poi
  `updatedByDevice` in ordine lessicografico. È una scelta deterministica
  adatta al singolo utente, non una fusione semantica.
- SQLite usa WAL e un solo processo Uvicorn. Il broadcaster SSE è in memoria;
  lo scaling orizzontale non è supportato nell'MVP.
- Non sono presenti analytics, tracker o account cloud obbligatori.

## Eliminazione dei dati

Da **Impostazioni → Privacy e dati** è possibile cancellare il database locale.
Per eliminare anche la copia server, arrestare lo stack e rimuovere
esplicitamente il volume `bianco_data` dopo aver verificato i backup.

## Licenza

[MIT](LICENSE)
