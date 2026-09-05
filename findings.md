# Findings PWA — 2026-09-05

Deployment testato e HEAD locale: `c2796099eee71eece0c0a9ee6c73bd6c1475891c`.
`client/src/app.js` locale identico allo snapshot distribuito. API/Caddy ARM64
su Galaxy A15 tramite termux-stacks; browser integrato Codex sul Mac, tunnel
SSH su `127.0.0.1:18083`. Solo dati sintetici; servizi AI disabilitati.

Login, dashboard, archivio, modifica online e layout a 1280/360 px funzionano.
Nessun overflow orizzontale a 360 px. Manifest standalone e icone sono serviti;
il ricaricamento senza server mantiene consultabili dashboard e dati locali.

## B1 — P2: modifica non salvabile con server irraggiungibile

1. Accedere online, aprire Archivio e premere `+ Manuale`; si apre una nuova
   ricevuta. Lasciare il dettaglio aperto.
2. Interrompere solo il tunnel al server. **Non disattivare la rete generale:**
   questo caso è diverso da `navigator.onLine=false`.
3. Inserire esercente `Verifica offline PWA A15`, totale `1.23`, valuta EUR
   e premere Salva.
4. La UI mostra `Sync sospesa` e `Non è stato possibile salvare le modifiche.`
   Ricaricando, la ricevuta è ancora senza esercente/importo: l'edit non è salvato.
5. Ripristinare il collegamento, riaprire e ripetere gli stessi valori:
   `Modifiche salvate.`; l'API conferma `totalMinor=123` e l'esercente inserito.

Atteso: un'indisponibilità del server non impedisce il salvataggio locale
coerente della modifica; la sincronizzazione resta pendente e riprende dopo.

Indicazione nel codice: `client/src/app.js` inizializza `online` da
`navigator.onLine` (121). In `saveDetail()` (1143), i rami online (1165–1182)
attendono la revisione/PUT remoto; un errore di trasporto finisce nel catch
generico, senza eseguire il ramo di salvataggio locale. Vedere anche
`client/src/sync/receipt-aggregates.js`, `putReceiptAggregate()`.

Non confondere con errori 401/403/409 o di validazione: un fallback indiscriminato
potrebbe aggirare autenticazione o perdere la protezione dai conflitti.

Chiusura: testare separatamente rete disattivata, rete attiva/server assente,
timeout, riconnessione e reload. Verificare persistenza locale e convergenza
di ricevuta + prodotti, senza duplicati o perdita di revisioni; mantenere
esplicita la gestione di conflitti e autenticazione.

## Evidenze e limiti

- Resoconto comune: `../termux-stacks/docs/evidence/PILOTS-2026-09-05.md`.
- A15: `~/txsp.Zrh5LyOb/ui-evidence.HiJwlf/ui-assets-sync.log` conferma il
  salvataggio online successivo; errore offline e screenshot sono nel task.
- Audit npm della build: 2 segnalazioni high, da rivalutare sul lockfile prima
  dell'esposizione pubblica; non è stata verificata la sfruttabilità a runtime.
- Non testati: installazione sulla home Android, fotocamera/OCR/AI, Doze.
  Non modificare `.env`, volumi o deployment originali per riprodurre il test.

## Risoluzione — 2026-09-05

B1 corretto nella codebase locale. Il salvataggio scrive scontrino e prodotti
in un unico documento RxDB locale (`receipt_edits`), prima di contattare il
server. Archivio, dettaglio, grafici ed export leggono anche le modifiche in
attesa. Questa coda non passa dalla replica LWW dei singoli documenti: al ritorno
del server usa l'endpoint aggregato con controllo della revisione.

- Errori di trasporto e timeout (5 s, compreso il corpo della risposta) lasciano
  la modifica persistita e riprovabile automaticamente, anche dopo un reload.
- Una risposta persa dopo un PUT riuscito viene riconosciuta tramite GET, senza
  duplicare il salvataggio. La bozza resta presente fino al completo aggiornamento
  delle copie locali; una successiva modifica nello stesso browser non è rimossa
  dall'acknowledgement di quella precedente.
- 401/403/422 e conflitti non causano fallback alla replica dei singoli campi.
  La bozza è preservata; i conflitti sono visibili nell'archivio e nel dettaglio.
  L'utente può caricare la versione sincronizzata, previa conferma esplicita.
- Validazione locale prima della persistenza, quantità/importi finiti e limiti
  coerenti con l'API; identità dei prodotti mantenute.
- Aggiornate le dipendenze transitive `browserslist` (4.28.9) e `fast-uri` (3.1.7),
  con relativi database di compatibilità. `npm audit`: zero vulnerabilità.

Verifiche: 82 test unitari client, lint e build; 28 test end-to-end Chromium e
WebKit. Otto prove E2E dedicate coprono rete attiva/server assente, modalità
aereo, timeout, reload, convergenza su un secondo client, prodotti senza duplicati
e conflitto reale fra client. I guasti sono applicati da un proxy locale esterno
al browser, così coprono anche le richieste gestite dai service worker.

Limite dichiarato: in WebKit di Playwright, il reload con `setOffline(true)`
fallisce anche con una pagina minimale e un service worker esclusivamente cache.
La prova WebKit salva con `navigator.onLine=false`, poi effettua il reload con
rete attiva ma proxy totalmente irraggiungibile; verifica comunque persistenza e
successiva convergenza. Non equivale a qualificare la navigazione in modalità
aereo su Safari reale. L'automazione dei service worker ha
[limiti documentati da Playwright](https://playwright.dev/docs/service-workers).

Prova manuale aggiuntiva nel browser integrato: server Caddy dello stack sintetico
fermato, salvataggio di 1,23 €, reload offline, riavvio del server; l'API/SQLite
confermano `totalMinor=123` dopo la sincronizzazione automatica.

Nessuna modifica a termux-stacks, dati del Galaxy A15, `.env` o volumi originali.
Il collaudo/deploy A15 resta da coordinare tramite `../messageboard/PROTOCOL.md`;
le note locali AGENTS.md ora indicano il Galaxy anziché Karonte come destinazione.
