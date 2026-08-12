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
    noPreviousComparison: 'Noch kein vergleichbarer vorheriger Zeitraum',
    savedReceipts: 'Gespeicherte Belege',
    needsAttention: 'Zu prüfen',
    reviewReceipts: 'Belege prüfen',
    details: 'Mehr Details',
    pendingActivities_one: '{{count}} Vorgang in der Warteschlange',
    pendingActivities_other: '{{count}} Vorgänge in der Warteschlange',
    categories: {
      title: 'Kategorien',
      chartAria: 'Ausgaben nach Kategorie',
      empty: 'Die Daten dieses Monats werden hier angezeigt.'
    },
    spendingTrend: {
      title: 'Ausgabenentwicklung',
      lastPeriods: 'Letzte {{count}} Zeiträume',
      periodAria: 'Zeitliche Gruppierung der Ausgaben',
      weekly: 'Wochen',
      monthly: 'Monate',
      chartAria: 'Ausgaben im Zeitverlauf',
      empty: 'Die Ausgaben werden hier angezeigt.'
    },
    insights: {
      title: 'Auffälligkeiten',
      thresholdDescription: 'Erforderlich sind Änderungen von mindestens {{amount}} und {{percent}} %.',
      empty: 'Noch keine aussagekräftige Veränderung.',
      aiAggregatedOnly: 'Zusammenfassung',
      generate: 'Einblicke vertiefen',
      refresh: 'Zusammenfassung aktualisieren'
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
    frameDescription: 'Wir richten den Beleg vorsichtig aus und beschneiden ihn, wobei Details bis 3200 px erhalten bleiben.',
    openCamera: 'Kamera öffnen',
    chooseGallery: 'Aus Galerie auswählen',
    manual: 'Ohne Foto eingeben',
    preparingPreview: 'Belegränder werden erkannt…',
    applyingCorrection: 'Ausschnitt und Perspektive werden korrigiert…',
    previewAlt: 'Belegvorschau',
    cropDetected: 'Ränder automatisch erkannt',
    cropFallback: 'Ausschnitt über dem Beleg positionieren',
    cropHint: 'Ziehe bei Bedarf die vier Ecken: Die Lupe zeigt automatisch den Detailbereich.',
    cropInvalid: 'Die Kontur kreuzt sich oder ist zu klein. Passe die Ecken an, um fortzufahren.',
    cropEditorAria: 'Korrektur des Belegausschnitts',
    cropCornerAria: 'Ausschnittecke {{index}}',
    retry: 'Neu aufnehmen',
    confirm: 'Bestätigen'
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
      chatgptDescription: 'Nutze die in deinem ChatGPT-Abo enthaltenen Codex-Modelle. Es werden weder API-Schlüssel noch API-Abrechnung verwendet.',
      connectChatgpt: 'ChatGPT verbinden',
      deviceCode: 'Einmaliger OpenAI-Code',
      openOpenAi: 'OpenAI öffnen',
      copyCode: 'Code kopieren',
      deviceCodeHint: 'Melde dich auf der geöffneten OpenAI-Seite an und gib diesen Code ein. Kehre anschließend zu Bianco zurück.',
      connectedPlan: 'Verbundener Tarif:',
      model: 'Codex-Modell',
      loadingModels: 'Verfügbare Modelle werden geladen…',
      chooseModel: 'Modell auswählen',
      recommended: 'Empfohlen',
      disconnectChatgpt: 'ChatGPT trennen',
      endpoint: 'Anbieteradresse',
      ollamaEndpointHint: 'Die Adresse muss vom API-Container erreichbar sein. Verwende die IP des Ollama-Servers oder einen vom Container-Runtime unterstützten Hostnamen.',
      apiKey: 'API-Schlüssel',
      apiKeyOptional: 'API-Schlüssel (optional)',
      savedKeyPlaceholder: 'Gespeicherter Schlüssel',
      newKeyPlaceholder: 'API-Schlüssel eingeben',
      removeSavedKey: 'Gespeicherten Schlüssel entfernen',
      active: 'Aktiv:',
      securityNote: 'ChatGPT-Zugangsdaten bleiben im Backend und werden nie an die PWA gesendet. OpenAI-kompatible API-Schlüssel werden auf dem Server verschlüsselt und aus dem Formularspeicher gelöscht.'
    },
    insights: {
      title: 'Erkenntnisse',
      minimumPercent: 'Mindestschwelle in Prozent',
      minimumAmount: 'Absolute Mindestschwelle ({{currency}})',
      apply: 'Schwellenwerte anwenden'
    },
    backup: {
      title: 'Dieses Gerät exportieren',
      includeImages: 'Bilder in JSON einschließen',
      export: 'JSON exportieren',
      estimatedSpace: 'Lokale Nutzung: {{usage}}. Exporte enthalten Daten, keine Bilder oder wiederherstellbare Server-Sicherung.'
    },
    account: {
      title: 'Konto',
      description: 'Beende die authentifizierte Sitzung auf diesem Gerät.',
      signOut: 'Abmelden',
      signOutAndDelete: 'Abmelden und Daten von diesem Gerät entfernen'
    },
    privacy: {
      title: 'Datenschutz und Daten',
      description: 'Belege, Bilder, Aufträge und Einstellungen nur von diesem Gerät löschen.',
      deleteAll: 'Dieses Gerät zurücksetzen'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Andere / OpenAI-kompatibel'
    },
    enterEndpoint: 'Gib die Anbieteradresse ein.',
    enterApiKey: 'Gib den API-Schlüssel ein, um den Anbieter zu verbinden.',
    connectChatgpt: 'Verbinde dein ChatGPT-Abo, um fortzufahren.',
    startingChatgptLogin: 'Sichere OpenAI-Anmeldung wird gestartet…',
    waitingChatgptLogin: 'Warten auf die Autorisierung durch OpenAI…',
    chooseModel: 'Wähle eines der für dein Konto verfügbaren Codex-Modelle.',
    noModels: 'Für dieses Konto sind keine bildfähigen Codex-Modelle verfügbar.',
    modelsUnavailable: 'Die Codex-Modellliste ist derzeit nicht verfügbar.',
    activatingModel: 'Ausgewähltes Modell wird aktiviert…',
    chatgptLoginFailed: 'Die ChatGPT-Verbindung konnte nicht abgeschlossen werden.',
    chatgptLoginExpired: 'Der OpenAI-Code ist abgelaufen. Starte eine neue Verbindung.',
    chatgptLogoutFailed: 'ChatGPT konnte nicht getrennt werden.',
    checking: 'Verbindung wird geprüft…',
    providerActive: '{{provider}} ist verbunden und aktiv.',
    backendUnavailable: 'Der Anbieter oder die KI-Konfiguration des Backends ist nicht verfügbar.',
    unreachable: 'Der Anbieter ist nicht erreichbar. Prüfe die Adresse und versuche es erneut.',
    activationFailed: 'Der Anbieter konnte nicht aktiviert werden. Prüfe die Konfiguration und versuche es erneut.'
  },
  receiptDetail: {
    title: 'Beleg prüfen',
    close: 'Schließen',
    photoAlt: 'Foto des Belegs',
    openFullImage: 'Vollständiges Bild öffnen',
    loadingFullImage: 'Vollständiges Bild wird geladen…',
    fullImageTitle: 'Vollständiges Bild des Belegs',
    closeFullImage: 'Vollständiges Bild schließen',
    noLocalImage: 'Kein lokales Bild',
    retryProcessing: 'Verarbeitung erneut versuchen',
    reanalyze: 'Mit KI neu analysieren',
    magnifierHint: 'Bewege die Maus über das Bild; per Touch gedrückt halten und ziehen.',
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
    productCategoryAria: 'Produktkategorie {{index}}',
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
    updateDeferred: 'Update bereit. Beende zuerst die aktuelle Bearbeitung.',
    backupCreated: 'JSON-Export erstellt.',
    codeCopied: 'OpenAI-Code kopiert.',
    chatgptDisconnected: 'ChatGPT getrennt.'
  },
  confirm: {
    reanalyzeReceiptTitle: 'Beleg neu analysieren',
    reanalyzeReceipt: 'Das Foto mit dem aktiven KI-Modell erneut verarbeiten? Extrahierte Daten und bestätigte Korrekturen werden durch das neue Ergebnis ersetzt.',
    deleteReceiptTitle: 'Beleg löschen',
    deleteReceipt: 'Diesen Beleg und sein lokales Bild löschen?',
    deleteAllDataTitle: 'Lokale Daten löschen',
    deleteAllData: 'Alle Bianco-Daten endgültig von diesem Gerät löschen?',
    logoutAndDeleteTitle: 'Abmelden und lokale Daten entfernen',
    logoutAndDelete: 'Abmelden und Bianco-Daten samt Belegbildern endgültig von diesem Gerät entfernen? Serverdaten werden nicht gelöscht.'
  },
  warning: {
    incompleteImageSave: 'Das Bild wurde nicht vollständig gespeichert.'
  },
  error: {
    databaseOpen: 'Das lokale Archiv konnte nicht geöffnet werden.',
    secureContextRequired: 'Öffne Bianco über HTTPS oder localhost, um das lokale Archiv und die Offline-Funktionen zu verwenden.',
    invalidImage: 'Wähle eine Bilddatei aus.',
    imageTooLarge: 'Dieses Bild ist größer als 10 MB. Wähle ein kleineres Foto.',
    saveFailed: 'Die Änderungen konnten nicht gespeichert werden.',
    receiptConflict: 'Dieser Beleg wurde auf einem anderen Gerät geändert. Das Speichern wurde gestoppt, damit nichts überschrieben wird; deine Änderungen bleiben hier sichtbar.',
    imageUnavailable: 'Das Bild ist nicht verfügbar.',
    invalidConfiguration: 'Die Konfiguration ist ungültig.',
    backendUnavailable: 'Das Bianco-Backend ist nicht erreichbar.',
    summaryUnavailable: 'Die Zusammenfassung ist nicht verfügbar.',
    backupFailed: 'Die Sicherung konnte nicht erstellt werden.',
    receiptImageMissing: 'Das Belegbild fehlt.',
    fullReceiptImageUnavailable: 'Das vollständige Belegbild ist nicht verfügbar.',
    logoutFailed: 'Die Abmeldung konnte nicht abgeschlossen werden. Lokale Daten wurden entfernt.',
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
