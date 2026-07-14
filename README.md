# Bianco

Bianco è una PWA mobile-first, local-first e offline-first per acquisire,
correggere e analizzare scontrini. RxDB nel browser è la fonte primaria; il
backend FastAPI aggiunge sincronizzazione automatica, backup e analisi tramite
provider OpenAI, OpenAI-compatible o Ollama. Le fotografie vengono accodate nel
backend: l'estrazione prosegue anche se il telefono viene bloccato o la PWA viene
chiusa. Quando il backend è raggiungibile,
la sincronizzazione parte automaticamente; offline, RxDB continua a essere la
fonte primaria. L'interfaccia usa Pico CSS incluso nella
build locale, senza dipendenze da CDN.

## Avvio rapido

Sono richiesti soltanto Docker (o un runtime compatibile), Docker Compose e
Git. Node.js, Python e SQLite non devono essere installati sull'host.

```bash
cp .env.example .env
# Generare una password hash con il comando seguente e copiarla in .env,
# tra apici singoli, come BIANCO_AUTH_PASSWORD_HASH.
docker run --rm -it caddy:2.11.4-alpine caddy hash-password
# Impostare anche BIANCO_SYNC_TOKEN e BIANCO_SECRET_KEY con segreti distinti.
docker compose up -d --build
```

Aprire `http://localhost` e autenticarsi con `BIANCO_AUTH_USER` e la password
usata per generare l'hash. La sincronizzazione non richiede configurazione nel
browser: parte e riprende automaticamente quando il backend è raggiungibile.
Per un deployment pubblico impostare `BIANCO_SITE_ADDRESS` a un dominio HTTPS
gestito da Caddy.
Con runtime container rootless, impostare `BIANCO_HTTP_PORT` e
`BIANCO_HTTPS_PORT` a porte host non privilegiate (per esempio 8080/8443).

## Sviluppo

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

La PWA è su `http://localhost:5173`; Vite inoltra `/api` al container API. Le
porte di sviluppo accettano connessioni soltanto dal computer locale. I dati di
sviluppo risiedono in `./data`.

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
interno e riavvia il servizio. Conservare backup, token e `BIANCO_SECRET_KEY`
in un luogo protetto: la stessa chiave è necessaria per decifrare le API key
salvate dopo un ripristino.

## Configurazione AI

OpenAI, Ollama e gli endpoint OpenAI-compatible possono essere configurati da
**Impostazioni → Intelligenza artificiale**. Le API key vengono inviate al
backend tramite HTTPS, cifrate con `BIANCO_SECRET_KEY` e non vengono salvate nel
browser. Inserito l'endpoint, Bianco lo verifica e carica i modelli; la scelta
di un modello lo rende immediatamente attivo, senza ulteriori conferme.

Le variabili d'ambiente restano disponibili come configurazione iniziale o
fallback. Per OpenAI:

```env
BIANCO_AI_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

Per un altro endpoint compatibile con l'API OpenAI:

```env
BIANCO_AI_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_MODEL=...
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

Il client carica la fotografia una sola volta nel backend di Bianco e non chiama
mai direttamente il provider AI. Il backend conserva l'immagine nel volume
privato, crea un job SQLite persistente e aggiorna automaticamente lo scontrino
tramite la replica quando il provider ha terminato. In caso di riavvio i job
interrotti tornano in coda. `BIANCO_AI_WORKER_POLL_SECONDS` regola l'intervallo
del worker e `BIANCO_AI_WORKER_MAX_ATTEMPTS` il numero massimo di tentativi per
gli errori del provider.

## Architettura e limiti MVP

- Tutte le modifiche utente vengono prima salvate in RxDB/Dexie.
- La replica è sempre attiva quando c'è rete e riprende dopo ogni periodo
  offline; non esiste un interruttore lato client.
- Il token interno API non viene inviato né salvato nel browser: Caddy protegge
  l'intera applicazione con password e autentica le richieste inoltrate.
- `receipts` e `receipt_items` usano replica incrementale con checkpoint server.
- Immagini e thumbnail sono attachment locali e vengono sincronizzate fuori
  dai payload JSON.
- L'upload crea una coda AI persistente nel backend. Il client conserva soltanto
  la coda di upload necessaria per l'offline-first; estrazione e retry AI sono
  responsabilità del worker server.
- Il worker non sovrascrive uno scontrino già confermato o righe già modificate
  dall'utente. Il risultato AI non confermato resta sempre modificabile dalla UI.
- Gli aggiornamenti live SSE trasportano soltanto il segnale `RESYNC`.
- I conflitti usano last-write-wins: prima `updatedAt`, poi
  `updatedByDevice` in ordine lessicografico. È una scelta deterministica
  adatta al singolo utente, non una fusione semantica.
- SQLite usa WAL e un solo processo Uvicorn. Il broadcaster SSE è in memoria;
  lo scaling orizzontale non è supportato nell'MVP.
- Non sono presenti analytics, tracker o account cloud obbligatori.

## Sicurezza operativa

- Non pubblicare Bianco in HTTP: usare un dominio HTTPS gestito da Caddy oppure
  una rete privata/VPN.
- Usare password e segreti lunghi, casuali e distinti; conservare il file `.env`
  fuori da backup o condivisioni non cifrate.
- Il compose di produzione non pubblica direttamente la porta FastAPI. Gli
  endpoint provider rifiutano credenziali negli URL, servizi metadata, indirizzi
  link-local e HTTP pubblico; HTTP resta consentito sulle reti private per
  Ollama locale.
- Caddy applica autenticazione, CSP, anti-framing, HSTS e altre intestazioni di
  hardening. La sicurezza assoluta non esiste: aggiornare regolarmente immagini
  e dipendenze e limitare l'accesso di rete resta necessario.

## Eliminazione dei dati

Da **Impostazioni → Privacy e dati** è possibile cancellare il database locale.
Per eliminare anche la copia server, arrestare lo stack e rimuovere
esplicitamente il volume `bianco_data` dopo aver verificato i backup.

## Licenza

[MIT](LICENSE)
