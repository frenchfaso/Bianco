export default {
  meta: {
    title: 'Bianco',
    description: 'Klare Kassenbons, auch offline.'
  },
  brand: {
    tagline: 'Deine Belege, klar und übersichtlich',
    homeAria: 'Bianco, Übersicht'
  },
  common: {
    loadingArchive: 'Dein lokales Archiv wird geöffnet…',
    close: 'Schließen',
    cancel: 'Abbrechen',
    save: 'Speichern',
    confirm: 'Bestätigen',
    delete: 'Löschen',
    retry: 'Erneut versuchen',
    manual: 'Manuell',
    notAvailable: '—'
  },
  connection: {
    online: 'Online',
    offline: 'Offline',
    syncing: 'Synchronisierung',
    paused: 'Sync pausiert',
    localOnly: 'Nur lokal'
  },
  nav: {
    mainAria: 'Hauptnavigation',
    dashboard: 'Übersicht',
    capture: 'Erfassen',
    archive: 'Archiv'
  },
  dashboard: {
    eyebrow: 'Aktueller Monat',
    title: 'Übersicht',
    periodSpend: 'Ausgaben im Zeitraum',
    previousComparison: 'im Vergleich zum vorherigen Zeitraum',
    savedReceipts: 'Gespeicherte Belege',
    pendingActivities_one: '{{count}} Vorgang in der Warteschlange',
    pendingActivities_other: '{{count}} Vorgänge in der Warteschlange',
    categories: {
      title: 'Kategorien',
      chartAria: 'Ausgaben nach Kategorie',
      empty: 'Die Daten dieses Monats werden hier angezeigt.'
    },
    insights: {
      title: 'Auffälligkeiten',
      local: 'Lokal berechnet',
      thresholdDescription: 'Erforderlich sind Änderungen von mindestens {{amount}} und {{percent}} %.',
      aiAggregatedOnly: 'KI-Zusammenfassung · nur aggregierte Daten',
      generate: 'Zusammenfassung erstellen'
    },
    merchants: {
      title: 'Händler',
      top: 'Top 5',
      purchases_one: '{{count}} Einkauf',
      purchases_other: '{{count}} Einkäufe',
      empty: 'Keine Händler in diesem Zeitraum.'
    },
    products: {
      title: 'Produkte',
      top: 'Top 5',
      units_one: '{{count}} Einheit',
      units_other: '{{count}} Einheiten',
      times_one: '{{count}} Mal',
      times_other: '{{count}} Mal',
      quantityFrequency: '{{quantity}} · {{frequency}}',
      empty: 'Extrahierte Produkte werden hier angezeigt.'
    },
    prices: {
      title: 'Preise',
      latestVsAverage: 'Zuletzt vs. Durchschnitt',
      empty: 'Mindestens zwei Stückpreise sind erforderlich.'
    }
  },
  archive: {
    eyebrow: 'Auf diesem Gerät',
    title: 'Archiv',
    addManual: '+ Manuell',
    searchPlaceholder: 'Händler oder Produkt suchen',
    searchAria: 'Suchen',
    categoryFilterAria: 'Nach Kategorie filtern',
    allCategories: 'Alle Kategorien',
    periodFilterAria: 'Nach Zeitraum filtern',
    period: {
      all: 'Alle Zeiträume',
      currentMonth: 'Aktueller Monat',
      previousMonth: 'Vorheriger Monat',
      currentYear: 'Aktuelles Jahr'
    },
    unknownMerchant: 'Beleg ohne Händler',
    empty: {
      title: 'Keine Belege',
      description: 'Fotografiere deinen ersten Beleg oder gib eine Ausgabe manuell ein.',
      capture: 'Erfassen'
    }
  },
  capture: {
    eyebrow: 'Sofort lokal gespeichert',
    title: 'Neuer Beleg',
    frameTitle: 'Den gesamten Beleg erfassen',
    frameDescription: 'Wir korrigieren Ausrichtung und Größe und speichern anschließend eine JPEG-Kopie mit höchstens 2200 px.',
    openCamera: 'Kamera öffnen',
    chooseGallery: 'Aus Galerie auswählen',
    manual: 'Ohne Foto eingeben',
    previewAlt: 'Belegvorschau',
    retry: 'Neu aufnehmen',
    save: 'Speichern',
    privacyNote: 'Das Foto bleibt in der lokalen Datenbank. Es wird nur an das Backend gesendet, wenn die zugehörigen Dienste konfiguriert und aktiviert sind.'
  },
  settings: {
    eyebrow: 'Standardmäßig lokal',
    title: 'Einstellungen',
    openAria: 'Einstellungen',
    closeAria: 'Einstellungen schließen',
    dialogAria: 'Bianco-Einstellungen',
    appearance: {
      title: 'Darstellung',
      themeLabel: 'Design',
      themeAuto: 'Automatisch',
      themeLight: 'Hell',
      themeDark: 'Dunkel',
      languageTitle: 'Sprache',
      languageLabel: 'App-Sprache',
      languageAuto: 'Automatisch',
      languageEn: 'English',
      languageIt: 'Italiano',
      languageDe: 'Deutsch',
      languageEs: 'Español',
      languageFr: 'Français'
    },
    ai: {
      title: 'Künstliche Intelligenz',
      unavailableOffline: 'Die Anbieter sind verfügbar, sobald Bianco wieder online ist.',
      provider: 'KI-Anbieter',
      endpoint: 'Anbieteradresse',
      ollamaEndpointHint: 'Die Adresse muss vom API-Container erreichbar sein. Verwende die IP des Ollama-Servers oder einen vom Container-Runtime unterstützten Hostnamen.',
      apiKey: 'API-Schlüssel',
      apiKeyOptional: 'API-Schlüssel (optional)',
      savedKeyPlaceholder: 'Gespeicherter Schlüssel',
      newKeyPlaceholder: 'API-Schlüssel eingeben',
      removeSavedKey: 'Gespeicherten Schlüssel entfernen',
      model: 'Modell',
      modelSearching: 'Modelle werden gesucht…',
      modelChoose: 'Modell auswählen',
      modelNone: 'Keine Modelle verfügbar',
      active: 'Aktiv:',
      securityNote: 'Endpunkte und Modelle werden automatisch geprüft. API-Schlüssel werden auf dem Server verschlüsselt und nach dem Speichern aus dem Formularspeicher gelöscht.'
    },
    insights: {
      title: 'Erkenntnisse',
      minimumPercent: 'Mindestschwelle in Prozent',
      minimumAmount: 'Absolute Mindestschwelle ({{currency}})',
      apply: 'Schwellenwerte anwenden'
    },
    backup: {
      title: 'Lokale Sicherung',
      includeImages: 'Bilder in JSON einschließen',
      export: 'JSON exportieren',
      estimatedSpace: 'Geschätzter Speicher: {{usage}}'
    },
    privacy: {
      title: 'Datenschutz und Daten',
      description: 'Belege, Bilder, Aufträge und Einstellungen nur von diesem Gerät löschen.',
      deleteAll: 'Alle lokalen Daten löschen'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Andere / OpenAI-kompatibel'
    },
    enterEndpoint: 'Gib die Anbieteradresse ein.',
    enterApiKey: 'Gib den API-Schlüssel ein, um Modelle zu laden.',
    checking: 'Verbindung wird geprüft…',
    checkingModels: 'Verbindung wird geprüft und Modelle werden gesucht…',
    modelsAvailable_one: '{{count}} Modell verfügbar.',
    modelsAvailable_other: '{{count}} Modelle verfügbar.',
    modelsActive_one: '{{provider}} · {{model}} ist aktiv. {{count}} Modell verfügbar.',
    modelsActive_other: '{{provider}} · {{model}} ist aktiv. {{count}} Modelle verfügbar.',
    selectAvailable_one: '{{count}} Modell verfügbar. Wähle es aus, um es sofort zu aktivieren.',
    selectAvailable_other: '{{count}} Modelle verfügbar. Wähle eines aus, um es sofort zu aktivieren.',
    noModels: 'Verbindung erfolgreich, aber der Anbieter stellt keine Modelle bereit.',
    unreachable: 'Der Anbieter ist nicht erreichbar. Prüfe die Adresse und versuche es erneut.',
    activating: 'Modell wird festgelegt…',
    modelActive: '{{provider}} · {{model}} ist jetzt das Modell von Bianco.',
    modelUnavailable: 'Das ausgewählte Modell ist nicht verfügbar.',
    activationFailed: 'Das Modell konnte nicht aktiviert werden. Prüfe die Konfiguration und versuche es erneut.'
  },
  receiptDetail: {
    title: 'Beleg prüfen',
    close: 'Schließen',
    photoAlt: 'Foto des Belegs',
    fullImageStored: 'Vollständiges Bild lokal gespeichert',
    openFullImage: 'Vollständiges Bild öffnen',
    noLocalImage: 'Kein lokales Bild',
    retryProcessing: 'Verarbeitung erneut versuchen',
    merchant: 'Händler',
    merchantPlaceholder: 'Händlername',
    date: 'Datum',
    total: 'Gesamt ({{currency}})',
    category: 'Kategorie',
    currency: 'Währung',
    products: 'Produkte',
    addProduct: '+ Produkt',
    productPlaceholder: 'Produkt',
    quantityPlaceholder: 'Menge',
    unitPricePlaceholder: '{{currency}}/Einheit',
    productTotalPlaceholder: 'Gesamt {{currency}}',
    productNameAria: 'Produktname {{index}}',
    quantityAria: 'Menge {{index}}',
    unitPriceAria: 'Stückpreis {{index}}',
    productTotalAria: 'Produktsumme {{index}}',
    deleteProductAria: 'Produkt {{index}} löschen',
    noProducts: 'Keine Produkte. Du kannst sie manuell hinzufügen.',
    delete: 'Löschen',
    save: 'Speichern'
  },
  receiptStatus: {
    captured: 'Erfasst',
    queued: 'In Warteschlange',
    processing: 'In Analyse',
    needsReview: 'Zu prüfen',
    confirmed: 'Bestätigt',
    failed: 'Fehlgeschlagen',
    manual: 'Manuell'
  },
  category: {
    foodGrocery: 'Lebensmittel',
    restaurant: 'Gastronomie',
    transport: 'Verkehr',
    home: 'Haushalt',
    health: 'Gesundheit',
    personal: 'Persönliches',
    entertainment: 'Freizeit',
    other: 'Sonstiges'
  },
  insight: {
    categoryIncreased: 'Die Ausgaben für {{category}} sind um {{percent}} % gestiegen.',
    categoryDecreased: 'Die Ausgaben für {{category}} sind um {{percent}} % gesunken.',
    merchantMore: 'Du hast bei {{merchant}} {{amount}} mehr ausgegeben.',
    merchantLess: 'Du hast bei {{merchant}} {{amount}} weniger ausgegeben.',
    frequency_one: '{{product}} wurde {{count}} Mal gekauft.',
    frequency_other: '{{product}} wurde {{count}} Mal gekauft.',
    priceIncreased: 'Der Preis von {{product}} ist um {{percent}} % gestiegen.',
    priceDecreased: 'Der Preis von {{product}} ist um {{percent}} % gesunken.'
  },
  date: {
    unknown: 'Datum prüfen'
  },
  storage: {
    usage: '{{used}} MB von {{quota}} MB'
  },
  notification: {
    offlineReady: 'Bianco ist für die Offline-Nutzung bereit.',
    receiptSaved: 'Beleg gespeichert.',
    receiptConfirmed: 'Beleg bestätigt.',
    changesSaved: 'Änderungen gespeichert.',
    receiptDeleted: 'Beleg gelöscht.',
    processingQueued: 'Verarbeitung erneut eingereiht.',
    analysisCompleted: 'Analyse abgeschlossen: Prüfe das Ergebnis.',
    thresholdsUpdated: 'Schwellenwerte aktualisiert.',
    summarySaved: 'Zusammenfassung lokal gespeichert.',
    backupCreated: 'JSON-Sicherung erstellt.'
  },
  confirm: {
    deleteReceiptTitle: 'Beleg löschen',
    deleteReceipt: 'Diesen Beleg und sein lokales Bild löschen?',
    deleteAllDataTitle: 'Lokale Daten löschen',
    deleteAllData: 'Alle Bianco-Daten endgültig von diesem Gerät löschen?'
  },
  warning: {
    incompleteImageSave: 'Das Bild wurde nicht vollständig gespeichert.'
  },
  error: {
    databaseOpen: 'Das lokale Archiv konnte nicht geöffnet werden.',
    secureContextRequired: 'Öffne Bianco über HTTPS oder localhost, um das lokale Archiv und die Offline-Funktionen zu verwenden.',
    invalidImage: 'Wähle eine Bilddatei aus.',
    saveFailed: 'Die Änderungen konnten nicht gespeichert werden.',
    imageUnavailable: 'Das Bild ist nicht verfügbar.',
    invalidConfiguration: 'Die Konfiguration ist ungültig.',
    backendUnavailable: 'Das Bianco-Backend ist nicht erreichbar.',
    summaryUnavailable: 'Die Zusammenfassung ist nicht verfügbar.',
    backupFailed: 'Die Sicherung konnte nicht erstellt werden.',
    receiptImageMissing: 'Das Belegbild fehlt.',
    fullReceiptImageUnavailable: 'Das vollständige Belegbild ist nicht verfügbar.',
    imageMetadataMissing: 'Die Bildinformationen fehlen.',
    fullImageAttachmentMissing: 'Das vollständige Bild fehlt.',
    receiptNotFound: 'Der Beleg wurde nicht gefunden.',
    jpegEncodingFailed: 'Das Bild konnte nicht vorbereitet werden.',
    requestFailed: 'Die Anfrage konnte nicht abgeschlossen werden.',
    unexpected: 'Ein Fehler ist aufgetreten. Versuche es erneut.'
  },
  pwa: {
    offlineReady: 'Bianco ist für die Offline-Nutzung bereit.',
    updateAvailable: 'Eine neue Version ist verfügbar.',
    update: 'Aktualisieren',
    installTitle: 'Bianco installieren',
    installDescription: 'Füge Bianco zum Startbildschirm hinzu, um es wie eine App und auch offline zu verwenden.',
    install: 'Installieren',
    notNow: 'Nicht jetzt'
  }
}
