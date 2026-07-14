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
    savedReceipts: 'Scontrini salvati',
    pendingActivities_one: '{{count}} attività in coda',
    pendingActivities_other: '{{count}} attività in coda',
    categories: {
      title: 'Categorie',
      chartAria: 'Spesa per categoria',
      empty: 'I dati del mese appariranno qui.'
    },
    insights: {
      title: 'Cosa emerge',
      local: 'Calcolo locale',
      thresholdDescription: 'Servono variazioni di almeno {{amount}} e {{percent}}%.',
      aiAggregatedOnly: 'Sintesi AI · solo dati aggregati',
      generate: 'Genera sintesi'
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
    frameDescription: 'Correggiamo orientamento e dimensioni, poi conserviamo una copia JPEG sotto 2200 px.',
    openCamera: 'Apri fotocamera',
    chooseGallery: 'Scegli dalla galleria',
    manual: 'Inserisci senza foto',
    previewAlt: 'Anteprima dello scontrino',
    retry: 'Ripeti',
    save: 'Salva',
    privacyNote: 'La foto resta nel database locale. Viene inviata al backend soltanto se configuri e abiliti i servizi relativi.'
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
      endpoint: 'Indirizzo del provider',
      ollamaEndpointHint: 'L’indirizzo deve essere raggiungibile dal container API. Usa l’IP del server Ollama oppure un hostname supportato dal runtime dei container.',
      apiKey: 'API key',
      apiKeyOptional: 'API key (facoltativa)',
      savedKeyPlaceholder: 'Chiave già salvata',
      newKeyPlaceholder: 'Inserisci API key',
      removeSavedKey: 'Rimuovi la chiave salvata',
      model: 'Modello',
      modelSearching: 'Ricerca modelli…',
      modelChoose: 'Scegli un modello',
      modelNone: 'Nessun modello disponibile',
      active: 'In uso:',
      securityNote: 'Endpoint e modelli vengono verificati automaticamente. Le API key sono cifrate sul server e cancellate dalla memoria del form dopo il salvataggio.'
    },
    insights: {
      title: 'Insight',
      minimumPercent: 'Soglia minima percentuale',
      minimumAmount: 'Soglia minima assoluta ({{currency}})',
      apply: 'Applica soglie'
    },
    backup: {
      title: 'Backup locale',
      includeImages: 'Includi immagini nel JSON',
      export: 'Esporta JSON',
      estimatedSpace: 'Spazio stimato: {{usage}}'
    },
    privacy: {
      title: 'Privacy e dati',
      description: 'Elimina ricevute, immagini, job e impostazioni soltanto da questo dispositivo.',
      deleteAll: 'Elimina tutti i dati locali'
    },
    install: {
      title: 'Installazione',
      description: 'Installa Bianco per aprirlo a schermo intero e usare l’app shell senza rete.',
      action: 'Installa PWA'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Altro / OpenAI-compatible'
    },
    enterEndpoint: 'Inserisci l’indirizzo del provider.',
    enterApiKey: 'Inserisci l’API key per caricare i modelli.',
    checking: 'Verifico la connessione…',
    checkingModels: 'Verifico la connessione e cerco i modelli…',
    modelsAvailable_one: '{{count}} modello disponibile.',
    modelsAvailable_other: '{{count}} modelli disponibili.',
    modelsActive_one: '{{provider}} · {{model}} è attivo. {{count}} modello disponibile.',
    modelsActive_other: '{{provider}} · {{model}} è attivo. {{count}} modelli disponibili.',
    selectAvailable_one: '{{count}} modello disponibile. Selezionalo per attivarlo subito.',
    selectAvailable_other: '{{count}} modelli disponibili. Scegline uno per attivarlo subito.',
    noModels: 'Connessione riuscita, ma il provider non espone modelli.',
    unreachable: 'Il provider non è raggiungibile. Controlla l’indirizzo e riprova.',
    activating: 'Imposto il modello…',
    modelActive: '{{provider}} · {{model}} è ora il modello di Bianco.',
    modelUnavailable: 'Il modello selezionato non è disponibile.',
    activationFailed: 'Non è stato possibile attivare il modello. Controlla la configurazione e riprova.'
  },
  receiptDetail: {
    title: 'Controlla lo scontrino',
    close: 'Chiudi',
    photoAlt: 'Fotografia dello scontrino',
    fullImageStored: 'Immagine completa conservata localmente',
    openFullImage: 'Apri immagine completa',
    noLocalImage: 'Nessuna immagine locale',
    retryProcessing: 'Riprova elaborazione',
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
    backupCreated: 'Backup JSON creato.'
  },
  confirm: {
    deleteReceipt: 'Eliminare questo scontrino e la sua immagine locale?',
    deleteAllData: 'Eliminare definitivamente tutti i dati di Bianco da questo dispositivo?'
  },
  warning: {
    incompleteImageSave: 'Salvataggio immagine incompleto.'
  },
  error: {
    databaseOpen: 'Non è stato possibile aprire l’archivio locale.',
    secureContextRequired: 'Apri Bianco tramite HTTPS o localhost per usare l’archivio locale e le funzioni offline.',
    invalidImage: 'Scegli un file immagine.',
    saveFailed: 'Non è stato possibile salvare le modifiche.',
    imageUnavailable: 'L’immagine non è disponibile.',
    invalidConfiguration: 'La configurazione non è valida.',
    backendUnavailable: 'Il backend di Bianco non è raggiungibile.',
    summaryUnavailable: 'La sintesi non è disponibile.',
    backupFailed: 'Non è stato possibile creare il backup.',
    receiptImageMissing: 'L’immagine dello scontrino è mancante.',
    fullReceiptImageUnavailable: 'L’immagine completa dello scontrino non è disponibile.',
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
    update: 'Aggiorna'
  }
}
