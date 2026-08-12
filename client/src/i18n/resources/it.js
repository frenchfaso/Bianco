export default {
  meta: {
    title: 'Bianco',
    description: 'Scontrini chiari, anche offline.'
  },
  brand: {
    tagline: 'I tuoi scontrini, finalmente chiari',
    homeAria: 'Bianco, panoramica'
  },
  common: {
    loadingArchive: 'Apro il tuo archivio locale…',
    close: 'Chiudi',
    cancel: 'Annulla',
    save: 'Salva',
    confirm: 'Conferma',
    delete: 'Elimina',
    retry: 'Riprova',
    manual: 'Manuale',
    notAvailable: '—'
  },
  connection: {
    online: 'Online',
    offline: 'Offline',
    syncing: 'Sincronizzo',
    paused: 'Sync sospesa',
    localOnly: 'Solo locale'
  },
  nav: {
    mainAria: 'Navigazione principale',
    dashboard: 'Panoramica',
    capture: 'Acquisisci',
    archive: 'Archivio'
  },
  dashboard: {
    eyebrow: 'Mese corrente',
    title: 'Panoramica',
    periodSpend: 'Spesa del periodo',
    previousComparison: 'rispetto al periodo precedente',
    noPreviousComparison: 'Non c’è ancora un periodo precedente confrontabile',
    savedReceipts: 'Scontrini salvati',
    needsAttention: 'Da controllare',
    reviewReceipts: 'Controlla scontrini',
    details: 'Più dettagli',
    pendingActivities_one: '{{count}} attività in coda',
    pendingActivities_other: '{{count}} attività in coda',
    categories: {
      title: 'Categorie',
      chartAria: 'Spesa per categoria',
      empty: 'I dati del mese appariranno qui.'
    },
    spendingTrend: {
      title: 'Andamento delle uscite',
      lastPeriods: 'Ultimi {{count}} periodi',
      periodAria: 'Raggruppamento temporale delle uscite',
      weekly: 'Settimane',
      monthly: 'Mesi',
      chartAria: 'Uscite nel tempo',
      empty: 'Le uscite appariranno qui.'
    },
    insights: {
      title: 'Cosa emerge',
      thresholdDescription: 'Servono variazioni di almeno {{amount}} e {{percent}}%.',
      empty: 'Per ora non emergono variazioni significative.',
      aiAggregatedOnly: 'Sintesi',
      generate: 'Approfondisci',
      refresh: 'Aggiorna sintesi'
    },
    merchants: {
      title: 'Esercenti',
      top: 'Top 5',
      purchases_one: '{{count}} acquisto',
      purchases_other: '{{count}} acquisti',
      empty: 'Nessun esercente nel periodo.'
    },
    products: {
      title: 'Prodotti',
      top: 'Top 5',
      units_one: '{{count}} unità',
      units_other: '{{count}} unità',
      times_one: '{{count}} volta',
      times_other: '{{count}} volte',
      quantityFrequency: '{{quantity}} · {{frequency}}',
      empty: 'I prodotti estratti appariranno qui.'
    },
    prices: {
      title: 'Prezzi',
      latestVsAverage: 'Ultimo vs media',
      empty: 'Servono almeno due prezzi unitari.'
    }
  },
  archive: {
    eyebrow: 'Sul dispositivo',
    title: 'Archivio',
    addManual: '+ Manuale',
    searchPlaceholder: 'Cerca esercente o prodotto',
    searchAria: 'Cerca',
    categoryFilterAria: 'Filtra categoria',
    allCategories: 'Tutte le categorie',
    periodFilterAria: 'Filtra periodo',
    period: {
      all: 'Tutti i periodi',
      currentMonth: 'Mese corrente',
      previousMonth: 'Mese precedente',
      currentYear: 'Anno corrente'
    },
    unknownMerchant: 'Scontrino senza esercente',
    empty: {
      title: 'Nessuno scontrino',
      description: 'Fotografa il primo scontrino oppure inserisci una spesa manualmente.',
      capture: 'Acquisisci'
    }
  },
  capture: {
    eyebrow: 'Salvataggio locale immediato',
    title: 'Nuovo scontrino',
    frameTitle: 'Inquadra tutto lo scontrino',
    frameDescription: 'Raddrizziamo e ritagliamo lo scontrino in modo conservativo, preservando i dettagli fino a 3200 px.',
    openCamera: 'Apri fotocamera',
    chooseGallery: 'Scegli dalla galleria',
    manual: 'Inserisci senza foto',
    preparingPreview: 'Rilevo i bordi dello scontrino…',
    applyingCorrection: 'Ritaglio e correggo la prospettiva…',
    previewAlt: 'Anteprima dello scontrino',
    cropDetected: 'Bordi rilevati automaticamente',
    cropFallback: 'Posiziona il ritaglio sullo scontrino',
    cropHint: 'Se necessario, trascina i quattro angoli: la lente mostra automaticamente il dettaglio.',
    cropInvalid: 'Il contorno si incrocia o è troppo piccolo: correggi gli angoli per continuare.',
    cropEditorAria: 'Correzione del ritaglio dello scontrino',
    cropCornerAria: 'Angolo del ritaglio {{index}}',
    retry: 'Ripeti',
    confirm: 'Conferma'
  },
  settings: {
    eyebrow: 'Locale per impostazione predefinita',
    title: 'Impostazioni',
    openAria: 'Impostazioni',
    closeAria: 'Chiudi impostazioni',
    dialogAria: 'Impostazioni di Bianco',
    appearance: {
      title: 'Aspetto',
      themeLabel: 'Tema',
      themeAuto: 'Automatico',
      themeLight: 'Chiaro',
      themeDark: 'Scuro',
      languageTitle: 'Lingua',
      languageLabel: 'Lingua dell’app',
      languageAuto: 'Automatica',
      languageEn: 'English',
      languageIt: 'Italiano',
      languageDe: 'Deutsch',
      languageEs: 'Español',
      languageFr: 'Français'
    },
    ai: {
      title: 'Intelligenza artificiale',
      unavailableOffline: 'I provider saranno disponibili quando Bianco tornerà online.',
      provider: 'Provider AI',
      chatgptDescription: 'Usa i modelli Codex inclusi nella tua subscription ChatGPT. Non vengono usate API key né fatturazione API.',
      connectChatgpt: 'Collega ChatGPT',
      deviceCode: 'Codice OpenAI monouso',
      openOpenAi: 'Apri OpenAI',
      copyCode: 'Copia codice',
      deviceCodeHint: 'Accedi a OpenAI nella pagina che si apre e inserisci questo codice. Puoi tornare a Bianco mentre completa il collegamento.',
      connectedPlan: 'Piano collegato:',
      model: 'Modello Codex',
      loadingModels: 'Caricamento modelli disponibili…',
      chooseModel: 'Scegli un modello',
      recommended: 'Consigliato',
      disconnectChatgpt: 'Scollega ChatGPT',
      endpoint: 'Indirizzo del provider',
      ollamaEndpointHint: 'L’indirizzo deve essere raggiungibile dal container API. Usa l’IP del server Ollama oppure un hostname supportato dal runtime dei container.',
      apiKey: 'API key',
      apiKeyOptional: 'API key (facoltativa)',
      savedKeyPlaceholder: 'Chiave già salvata',
      newKeyPlaceholder: 'Inserisci API key',
      removeSavedKey: 'Rimuovi la chiave salvata',
      active: 'In uso:',
      securityNote: 'Le credenziali ChatGPT restano sul backend e non vengono mai inviate alla PWA. Le API key OpenAI-compatible sono cifrate sul server e cancellate dalla memoria del form.'
    },
    insights: {
      title: 'Insight',
      minimumPercent: 'Soglia minima percentuale',
      minimumAmount: 'Soglia minima assoluta ({{currency}})',
      apply: 'Applica soglie'
    },
    backup: {
      title: 'Esporta questo dispositivo',
      includeImages: 'Includi immagini nel JSON',
      export: 'Esporta JSON',
      estimatedSpace: 'Uso locale: {{usage}}. L’esportazione contiene i dati, non le immagini né un backup server ripristinabile.'
    },
    account: {
      title: 'Account',
      description: 'Termina la sessione autenticata su questo dispositivo.',
      signOut: 'Esci',
      signOutAndDelete: 'Esci e rimuovi i dati da questo dispositivo'
    },
    privacy: {
      title: 'Privacy e dati',
      description: 'Elimina ricevute, immagini, job e impostazioni soltanto da questo dispositivo.',
      deleteAll: 'Reimposta questo dispositivo'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Altro / OpenAI-compatible'
    },
    enterEndpoint: 'Inserisci l’indirizzo del provider.',
    enterApiKey: 'Inserisci l’API key per collegare il provider.',
    connectChatgpt: 'Collega la tua subscription ChatGPT per continuare.',
    startingChatgptLogin: 'Avvio dell’accesso sicuro OpenAI…',
    waitingChatgptLogin: 'In attesa dell’autorizzazione da OpenAI…',
    chooseModel: 'Scegli uno dei modelli Codex disponibili per il tuo account.',
    noModels: 'Nessun modello Codex con supporto immagini è disponibile per questo account.',
    modelsUnavailable: 'La lista dei modelli Codex non è disponibile al momento.',
    activatingModel: 'Attivazione del modello selezionato…',
    chatgptLoginFailed: 'Non è stato possibile completare il collegamento a ChatGPT.',
    chatgptLoginExpired: 'Il codice OpenAI è scaduto. Avvia un nuovo collegamento.',
    chatgptLogoutFailed: 'Non è stato possibile scollegare ChatGPT.',
    checking: 'Verifico la connessione…',
    providerActive: '{{provider}} è collegato e attivo.',
    backendUnavailable: 'Il provider o la configurazione AI del backend non sono disponibili.',
    unreachable: 'Il provider non è raggiungibile. Controlla l’indirizzo e riprova.',
    activationFailed: 'Non è stato possibile attivare il provider. Controlla la configurazione e riprova.'
  },
  receiptDetail: {
    title: 'Controlla lo scontrino',
    close: 'Chiudi',
    photoAlt: 'Fotografia dello scontrino',
    openFullImage: 'Apri immagine completa',
    loadingFullImage: 'Caricamento immagine completa…',
    fullImageTitle: 'Immagine completa dello scontrino',
    closeFullImage: 'Chiudi immagine completa',
    noLocalImage: 'Nessuna immagine locale',
    retryProcessing: 'Riprova elaborazione',
    reanalyze: 'Rivaluta con AI',
    magnifierHint: 'Sposta il mouse sulla foto; su touch tieni premuto e trascina.',
    merchant: 'Esercente',
    merchantPlaceholder: 'Nome esercente',
    date: 'Data',
    total: 'Totale ({{currency}})',
    category: 'Categoria',
    currency: 'Valuta',
    products: 'Prodotti',
    addProduct: '+ Prodotto',
    productPlaceholder: 'Prodotto',
    quantityPlaceholder: 'Qtà',
    unitPricePlaceholder: '{{currency}}/unità',
    productTotalPlaceholder: 'Totale {{currency}}',
    productNameAria: 'Nome prodotto {{index}}',
    quantityAria: 'Quantità {{index}}',
    unitPriceAria: 'Prezzo unitario {{index}}',
    productTotalAria: 'Totale prodotto {{index}}',
    productCategoryAria: 'Categoria prodotto {{index}}',
    deleteProductAria: 'Elimina prodotto {{index}}',
    noProducts: 'Nessun prodotto. Puoi aggiungerli manualmente.',
    delete: 'Elimina',
    save: 'Salva'
  },
  receiptStatus: {
    captured: 'Acquisito',
    queued: 'In coda',
    processing: 'Analisi',
    needsReview: 'Da controllare',
    confirmed: 'Confermato',
    failed: 'Non riuscito',
    manual: 'Manuale'
  },
  category: {
    foodGrocery: 'Spesa alimentare',
    restaurant: 'Ristorazione',
    transport: 'Trasporti',
    home: 'Casa',
    health: 'Salute',
    personal: 'Persona',
    entertainment: 'Tempo libero',
    other: 'Altro'
  },
  insight: {
    categoryIncreased: 'La spesa per {{category}} è aumentata del {{percent}}%.',
    categoryDecreased: 'La spesa per {{category}} è diminuita del {{percent}}%.',
    merchantMore: 'Hai speso {{amount}} in più da {{merchant}}.',
    merchantLess: 'Hai speso {{amount}} in meno da {{merchant}}.',
    frequency_one: '{{product}} è stato acquistato {{count}} volta.',
    frequency_other: '{{product}} è stato acquistato {{count}} volte.',
    priceIncreased: 'Il prezzo di {{product}} è aumentato del {{percent}}%.',
    priceDecreased: 'Il prezzo di {{product}} è diminuito del {{percent}}%.'
  },
  date: {
    unknown: 'Data da verificare'
  },
  storage: {
    usage: '{{used}} MB di {{quota}} MB'
  },
  notification: {
    offlineReady: 'Bianco è pronto per l’uso offline.',
    receiptSaved: 'Scontrino salvato.',
    receiptConfirmed: 'Scontrino confermato.',
    changesSaved: 'Modifiche salvate.',
    receiptDeleted: 'Scontrino eliminato.',
    processingQueued: 'Elaborazione rimessa in coda.',
    analysisCompleted: 'Analisi completata: controlla il risultato.',
    thresholdsUpdated: 'Soglie aggiornate.',
    summarySaved: 'Sintesi salvata localmente.',
    updateDeferred: 'Aggiornamento pronto. Termina la modifica corrente, poi aggiorna.',
    backupCreated: 'Esportazione JSON creata.',
    codeCopied: 'Codice OpenAI copiato.',
    chatgptDisconnected: 'ChatGPT scollegato.'
  },
  confirm: {
    reanalyzeReceiptTitle: 'Rivaluta lo scontrino',
    reanalyzeReceipt: 'Rielaborare la foto con il modello AI attivo? I dati estratti e le correzioni confermate verranno sostituiti dal nuovo risultato.',
    deleteReceiptTitle: 'Elimina scontrino',
    deleteReceipt: 'Eliminare questo scontrino e la sua immagine locale?',
    deleteAllDataTitle: 'Cancella dati locali',
    deleteAllData: 'Eliminare definitivamente tutti i dati di Bianco da questo dispositivo?',
    logoutAndDeleteTitle: 'Esci e rimuovi i dati locali',
    logoutAndDelete: 'Uscire e rimuovere definitivamente da questo dispositivo i dati e le immagini degli scontrini? I dati sul server non saranno eliminati.'
  },
  warning: {
    incompleteImageSave: 'Salvataggio immagine incompleto.'
  },
  error: {
    databaseOpen: 'Non è stato possibile aprire l’archivio locale.',
    secureContextRequired: 'Apri Bianco tramite HTTPS o localhost per usare l’archivio locale e le funzioni offline.',
    invalidImage: 'Scegli un file immagine.',
    imageTooLarge: 'L’immagine supera 10 MB. Scegli una foto più piccola.',
    saveFailed: 'Non è stato possibile salvare le modifiche.',
    receiptConflict: 'Questo scontrino è stato modificato su un altro dispositivo. Il salvataggio è stato fermato per non sovrascriverlo; le tue modifiche restano visibili qui.',
    imageUnavailable: 'L’immagine non è disponibile.',
    invalidConfiguration: 'La configurazione non è valida.',
    backendUnavailable: 'Il backend di Bianco non è raggiungibile.',
    summaryUnavailable: 'La sintesi non è disponibile.',
    backupFailed: 'Non è stato possibile creare il backup.',
    receiptImageMissing: 'L’immagine dello scontrino è mancante.',
    fullReceiptImageUnavailable: 'L’immagine completa dello scontrino non è disponibile.',
    logoutFailed: 'Non è stato possibile completare l’uscita. I dati locali sono stati rimossi.',
    imageMetadataMissing: 'Le informazioni dell’immagine sono mancanti.',
    fullImageAttachmentMissing: 'L’immagine completa è mancante.',
    receiptNotFound: 'Lo scontrino non è stato trovato.',
    jpegEncodingFailed: 'Non è stato possibile preparare l’immagine.',
    requestFailed: 'Non è stato possibile completare la richiesta.',
    unexpected: 'Si è verificato un problema. Riprova.'
  },
  pwa: {
    offlineReady: 'Bianco è pronto per l’uso offline.',
    updateAvailable: 'È disponibile una nuova versione.',
    update: 'Aggiorna',
    installTitle: 'Installa Bianco',
    installDescription: 'Aggiungilo alla schermata Home per aprirlo come un’app, anche offline.',
    install: 'Installa',
    notNow: 'Non ora'
  }
}
