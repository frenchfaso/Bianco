export default {
  meta: {
    title: 'Bianco',
    description: 'Clear receipts, even offline.'
  },
  brand: {
    tagline: 'Your receipts, made clear',
    homeAria: 'Bianco, dashboard'
  },
  common: {
    loadingArchive: 'Opening your local archive…',
    close: 'Close',
    save: 'Save',
    confirm: 'Confirm',
    delete: 'Delete',
    retry: 'Try again',
    manual: 'Manual',
    notAvailable: '—'
  },
  connection: {
    online: 'Online',
    offline: 'Offline',
    syncing: 'Syncing',
    paused: 'Sync paused',
    localOnly: 'Local only'
  },
  nav: {
    mainAria: 'Main navigation',
    dashboard: 'Overview',
    capture: 'Capture',
    archive: 'Archive'
  },
  dashboard: {
    eyebrow: 'Current month',
    title: 'Overview',
    periodSpend: 'Period spending',
    previousComparison: 'compared with the previous period',
    savedReceipts: 'Saved receipts',
    pendingActivities_one: '{{count}} queued task',
    pendingActivities_other: '{{count}} queued tasks',
    categories: {
      title: 'Categories',
      chartAria: 'Spending by category',
      empty: 'This month’s data will appear here.'
    },
    insights: {
      title: 'What stands out',
      local: 'Calculated locally',
      thresholdDescription: 'Changes of at least {{amount}} and {{percent}}% are required.',
      aiAggregatedOnly: 'AI summary · aggregated data only',
      generate: 'Generate summary'
    },
    merchants: {
      title: 'Merchants',
      top: 'Top 5',
      purchases_one: '{{count}} purchase',
      purchases_other: '{{count}} purchases',
      empty: 'No merchants in this period.'
    },
    products: {
      title: 'Products',
      top: 'Top 5',
      units_one: '{{count}} unit',
      units_other: '{{count}} units',
      times_one: '{{count}} time',
      times_other: '{{count}} times',
      quantityFrequency: '{{quantity}} · {{frequency}}',
      empty: 'Extracted products will appear here.'
    },
    prices: {
      title: 'Prices',
      latestVsAverage: 'Latest vs average',
      empty: 'At least two unit prices are required.'
    }
  },
  archive: {
    eyebrow: 'On this device',
    title: 'Archive',
    addManual: '+ Manual',
    searchPlaceholder: 'Search merchant or product',
    searchAria: 'Search',
    categoryFilterAria: 'Filter by category',
    allCategories: 'All categories',
    periodFilterAria: 'Filter by period',
    period: {
      all: 'All periods',
      currentMonth: 'Current month',
      previousMonth: 'Previous month',
      currentYear: 'Current year'
    },
    unknownMerchant: 'Receipt without a merchant',
    empty: {
      title: 'No receipts',
      description: 'Photograph your first receipt or enter an expense manually.',
      capture: 'Capture'
    }
  },
  capture: {
    eyebrow: 'Saved locally right away',
    title: 'New receipt',
    frameTitle: 'Frame the entire receipt',
    frameDescription: 'We correct its orientation and size, then keep a JPEG copy under 2200 px.',
    openCamera: 'Open camera',
    chooseGallery: 'Choose from gallery',
    manual: 'Enter without a photo',
    previewAlt: 'Receipt preview',
    retry: 'Retake',
    save: 'Save',
    privacyNote: 'The photo stays in the local database. It is sent to the backend only when the related services are configured and enabled.'
  },
  settings: {
    eyebrow: 'Local by default',
    title: 'Settings',
    openAria: 'Settings',
    closeAria: 'Close settings',
    dialogAria: 'Bianco settings',
    appearance: {
      title: 'Appearance',
      themeLabel: 'Theme',
      themeAuto: 'Automatic',
      themeLight: 'Light',
      themeDark: 'Dark',
      languageTitle: 'Language',
      languageLabel: 'App language',
      languageAuto: 'Automatic',
      languageEn: 'English',
      languageIt: 'Italiano',
      languageDe: 'Deutsch',
      languageEs: 'Español',
      languageFr: 'Français'
    },
    ai: {
      title: 'Artificial intelligence',
      unavailableOffline: 'Providers will be available when Bianco is back online.',
      provider: 'AI provider',
      endpoint: 'Provider address',
      ollamaEndpointHint: 'The address must be reachable from the API container. Use the Ollama server IP or a host name supported by your container runtime.',
      apiKey: 'API key',
      apiKeyOptional: 'API key (optional)',
      savedKeyPlaceholder: 'Saved key',
      newKeyPlaceholder: 'Enter API key',
      removeSavedKey: 'Remove saved key',
      model: 'Model',
      modelSearching: 'Searching for models…',
      modelChoose: 'Choose a model',
      modelNone: 'No models available',
      active: 'In use:',
      securityNote: 'Endpoints and models are checked automatically. API keys are encrypted on the server and removed from form memory after saving.'
    },
    insights: {
      title: 'Insights',
      minimumPercent: 'Minimum percentage threshold',
      minimumAmount: 'Minimum absolute threshold ({{currency}})',
      apply: 'Apply thresholds'
    },
    backup: {
      title: 'Local backup',
      includeImages: 'Include images in JSON',
      export: 'Export JSON',
      estimatedSpace: 'Estimated space: {{usage}}'
    },
    privacy: {
      title: 'Privacy and data',
      description: 'Delete receipts, images, jobs and settings from this device only.',
      deleteAll: 'Delete all local data'
    },
    install: {
      title: 'Installation',
      description: 'Install Bianco to open it full screen and use the app shell without a network connection.',
      action: 'Install PWA'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Other / OpenAI-compatible'
    },
    enterEndpoint: 'Enter the provider address.',
    enterApiKey: 'Enter the API key to load models.',
    checking: 'Checking the connection…',
    checkingModels: 'Checking the connection and searching for models…',
    modelsAvailable_one: '{{count}} model available.',
    modelsAvailable_other: '{{count}} models available.',
    modelsActive_one: '{{provider}} · {{model}} is active. {{count}} model available.',
    modelsActive_other: '{{provider}} · {{model}} is active. {{count}} models available.',
    selectAvailable_one: '{{count}} model available. Choose it to activate it immediately.',
    selectAvailable_other: '{{count}} models available. Choose one to activate it immediately.',
    noModels: 'Connection successful, but the provider exposes no models.',
    unreachable: 'The provider could not be reached. Check the address and try again.',
    activating: 'Setting the model…',
    modelActive: '{{provider}} · {{model}} is now Bianco’s model.',
    modelUnavailable: 'The selected model is not available.',
    activationFailed: 'The model could not be activated. Check the configuration and try again.'
  },
  receiptDetail: {
    title: 'Review receipt',
    close: 'Close',
    photoAlt: 'Receipt photograph',
    fullImageStored: 'Full image stored locally',
    openFullImage: 'Open full image',
    noLocalImage: 'No local image',
    retryProcessing: 'Retry processing',
    merchant: 'Merchant',
    merchantPlaceholder: 'Merchant name',
    date: 'Date',
    total: 'Total ({{currency}})',
    category: 'Category',
    currency: 'Currency',
    products: 'Products',
    addProduct: '+ Product',
    productPlaceholder: 'Product',
    quantityPlaceholder: 'Qty',
    unitPricePlaceholder: '{{currency}}/unit',
    productTotalPlaceholder: 'Total {{currency}}',
    productNameAria: 'Product name {{index}}',
    quantityAria: 'Quantity {{index}}',
    unitPriceAria: 'Unit price {{index}}',
    productTotalAria: 'Product total {{index}}',
    deleteProductAria: 'Delete product {{index}}',
    noProducts: 'No products. You can add them manually.',
    delete: 'Delete',
    save: 'Save'
  },
  receiptStatus: {
    captured: 'Captured',
    queued: 'Queued',
    processing: 'Processing',
    needsReview: 'Review needed',
    confirmed: 'Confirmed',
    failed: 'Failed',
    manual: 'Manual'
  },
  category: {
    foodGrocery: 'Groceries',
    restaurant: 'Dining',
    transport: 'Transport',
    home: 'Home',
    health: 'Health',
    personal: 'Personal',
    entertainment: 'Leisure',
    other: 'Other'
  },
  insight: {
    categoryIncreased: 'Spending on {{category}} increased by {{percent}}%.',
    categoryDecreased: 'Spending on {{category}} decreased by {{percent}}%.',
    merchantMore: 'You spent {{amount}} more at {{merchant}}.',
    merchantLess: 'You spent {{amount}} less at {{merchant}}.',
    frequency_one: '{{product}} was purchased {{count}} time.',
    frequency_other: '{{product}} was purchased {{count}} times.',
    priceIncreased: 'The price of {{product}} increased by {{percent}}%.',
    priceDecreased: 'The price of {{product}} decreased by {{percent}}%.'
  },
  date: {
    unknown: 'Date to review'
  },
  storage: {
    usage: '{{used}} MB of {{quota}} MB'
  },
  notification: {
    offlineReady: 'Bianco is ready for offline use.',
    receiptSaved: 'Receipt saved.',
    receiptConfirmed: 'Receipt confirmed.',
    changesSaved: 'Changes saved.',
    receiptDeleted: 'Receipt deleted.',
    processingQueued: 'Processing queued again.',
    analysisCompleted: 'Analysis complete: review the result.',
    thresholdsUpdated: 'Thresholds updated.',
    summarySaved: 'Summary saved locally.',
    backupCreated: 'JSON backup created.'
  },
  confirm: {
    deleteReceipt: 'Delete this receipt and its local image?',
    deleteAllData: 'Permanently delete all Bianco data from this device?'
  },
  warning: {
    incompleteImageSave: 'Image saving was incomplete.'
  },
  error: {
    databaseOpen: 'The local archive could not be opened.',
    secureContextRequired: 'Open Bianco over HTTPS or localhost to use the local archive and offline features.',
    invalidImage: 'Choose an image file.',
    saveFailed: 'The changes could not be saved.',
    imageUnavailable: 'The image is not available.',
    invalidConfiguration: 'The configuration is not valid.',
    backendUnavailable: 'Bianco’s backend is not reachable.',
    summaryUnavailable: 'The summary is not available.',
    backupFailed: 'The backup could not be created.',
    receiptImageMissing: 'The receipt image is missing.',
    fullReceiptImageUnavailable: 'The full receipt image is unavailable.',
    imageMetadataMissing: 'The image information is missing.',
    fullImageAttachmentMissing: 'The full image is missing.',
    receiptNotFound: 'The receipt could not be found.',
    jpegEncodingFailed: 'The image could not be prepared.',
    requestFailed: 'The request could not be completed.',
    unexpected: 'Something went wrong. Try again.'
  },
  pwa: {
    offlineReady: 'Bianco is ready for offline use.',
    updateAvailable: 'A new version is available.',
    update: 'Update'
  }
}
