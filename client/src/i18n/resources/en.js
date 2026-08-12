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
    cancel: 'Cancel',
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
    noPreviousComparison: 'No comparable previous period yet',
    savedReceipts: 'Saved receipts',
    needsAttention: 'Needs attention',
    reviewReceipts: 'Review receipts',
    details: 'More details',
    pendingActivities_one: '{{count}} queued task',
    pendingActivities_other: '{{count}} queued tasks',
    categories: {
      title: 'Categories',
      chartAria: 'Spending by category',
      empty: 'This month’s data will appear here.'
    },
    spendingTrend: {
      title: 'Spending trend',
      lastPeriods: 'Last {{count}} periods',
      periodAria: 'Spending time grouping',
      weekly: 'Weeks',
      monthly: 'Months',
      chartAria: 'Spending over time',
      empty: 'Spending will appear here.'
    },
    insights: {
      title: 'What stands out',
      thresholdDescription: 'Changes of at least {{amount}} and {{percent}}% are required.',
      empty: 'No meaningful change stands out yet.',
      aiAggregatedOnly: 'Summary',
      generate: 'Explore insights',
      refresh: 'Refresh summary'
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
    frameDescription: 'We conservatively straighten and crop the receipt, preserving detail up to 3200 px.',
    openCamera: 'Open camera',
    chooseGallery: 'Choose from gallery',
    manual: 'Enter without a photo',
    preparingPreview: 'Detecting the receipt edges…',
    applyingCorrection: 'Cropping and correcting perspective…',
    previewAlt: 'Receipt preview',
    cropDetected: 'Edges detected automatically',
    cropFallback: 'Position the crop over the receipt',
    cropHint: 'If needed, drag the four corners: the magnifier automatically shows the detail.',
    cropInvalid: 'The outline crosses itself or is too small. Adjust the corners to continue.',
    cropEditorAria: 'Receipt crop correction',
    cropCornerAria: 'Crop corner {{index}}',
    retry: 'Retake',
    confirm: 'Confirm'
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
      chatgptDescription: 'Use the Codex models included in your ChatGPT subscription. No API key or API billing is used.',
      connectChatgpt: 'Connect ChatGPT',
      deviceCode: 'One-time OpenAI code',
      openOpenAi: 'Open OpenAI',
      copyCode: 'Copy code',
      deviceCodeHint: 'Sign in to OpenAI in the page that opens, then enter this code. You can safely return to Bianco while it connects.',
      connectedPlan: 'Connected plan:',
      model: 'Codex model',
      loadingModels: 'Loading available models…',
      chooseModel: 'Choose a model',
      recommended: 'Recommended',
      disconnectChatgpt: 'Disconnect ChatGPT',
      endpoint: 'Provider address',
      ollamaEndpointHint: 'The address must be reachable from the API container. Use the Ollama server IP or a host name supported by your container runtime.',
      apiKey: 'API key',
      apiKeyOptional: 'API key (optional)',
      savedKeyPlaceholder: 'Saved key',
      newKeyPlaceholder: 'Enter API key',
      removeSavedKey: 'Remove saved key',
      active: 'In use:',
      securityNote: 'ChatGPT credentials stay on the backend and are never sent to the PWA. OpenAI-compatible API keys are encrypted on the server and removed from form memory.'
    },
    insights: {
      title: 'Insights',
      minimumPercent: 'Minimum percentage threshold',
      minimumAmount: 'Minimum absolute threshold ({{currency}})',
      apply: 'Apply thresholds'
    },
    backup: {
      title: 'Export this device',
      includeImages: 'Include images in JSON',
      export: 'Export JSON',
      estimatedSpace: 'Local use: {{usage}}. Exports contain receipt data, not images or a restorable server backup.'
    },
    account: {
      title: 'Account',
      description: 'End the authenticated session on this device.',
      signOut: 'Sign out',
      signOutAndDelete: 'Sign out and remove this device’s data'
    },
    privacy: {
      title: 'Privacy and data',
      description: 'Delete receipts, images, jobs and settings from this device only.',
      deleteAll: 'Reset this device'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Other / OpenAI-compatible'
    },
    enterEndpoint: 'Enter the provider address.',
    enterApiKey: 'Enter the API key to connect the provider.',
    connectChatgpt: 'Connect your ChatGPT subscription to continue.',
    startingChatgptLogin: 'Starting the secure OpenAI login…',
    waitingChatgptLogin: 'Waiting for authorization from OpenAI…',
    chooseModel: 'Choose one of the Codex models available to your account.',
    noModels: 'No image-capable Codex models are available for this account.',
    modelsUnavailable: 'The Codex model list is currently unavailable.',
    activatingModel: 'Activating the selected model…',
    chatgptLoginFailed: 'The ChatGPT connection could not be completed.',
    chatgptLoginExpired: 'The OpenAI code expired. Start a new connection.',
    chatgptLogoutFailed: 'ChatGPT could not be disconnected.',
    checking: 'Checking the connection…',
    providerActive: '{{provider}} is connected and active.',
    backendUnavailable: 'The provider or the backend AI configuration is unavailable.',
    unreachable: 'The provider could not be reached. Check the address and try again.',
    activationFailed: 'The provider could not be activated. Check the configuration and try again.'
  },
  receiptDetail: {
    title: 'Review receipt',
    close: 'Close',
    photoAlt: 'Receipt photograph',
    openFullImage: 'Open full image',
    loadingFullImage: 'Loading full image…',
    fullImageTitle: 'Full receipt image',
    closeFullImage: 'Close full image',
    noLocalImage: 'No local image',
    retryProcessing: 'Retry processing',
    reanalyze: 'Reanalyze with AI',
    magnifierHint: 'Move the mouse over the image; on touch, press and drag.',
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
    productCategoryAria: 'Product category {{index}}',
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
    updateDeferred: 'Update ready. Finish the current edit, then update.',
    backupCreated: 'JSON export created.',
    codeCopied: 'OpenAI code copied.',
    chatgptDisconnected: 'ChatGPT disconnected.'
  },
  confirm: {
    reanalyzeReceiptTitle: 'Reanalyze receipt',
    reanalyzeReceipt: 'Process the photo again with the active AI model? Extracted data and confirmed corrections will be replaced by the new result.',
    deleteReceiptTitle: 'Delete receipt',
    deleteReceipt: 'Delete this receipt and its local image?',
    deleteAllDataTitle: 'Delete local data',
    deleteAllData: 'Permanently delete all Bianco data from this device?',
    logoutAndDeleteTitle: 'Sign out and remove local data',
    logoutAndDelete: 'Sign out and permanently remove Bianco data and receipt images from this device? Server data will not be deleted.'
  },
  warning: {
    incompleteImageSave: 'Image saving was incomplete.'
  },
  error: {
    databaseOpen: 'The local archive could not be opened.',
    secureContextRequired: 'Open Bianco over HTTPS or localhost to use the local archive and offline features.',
    invalidImage: 'Choose an image file.',
    imageTooLarge: 'This image is larger than 10 MB. Choose a smaller photo.',
    saveFailed: 'The changes could not be saved.',
    receiptConflict: 'This receipt changed on another device. Saving was stopped to avoid overwriting it; your edits remain visible here.',
    imageUnavailable: 'The image is not available.',
    invalidConfiguration: 'The configuration is not valid.',
    backendUnavailable: 'Bianco’s backend is not reachable.',
    summaryUnavailable: 'The summary is not available.',
    backupFailed: 'The backup could not be created.',
    receiptImageMissing: 'The receipt image is missing.',
    fullReceiptImageUnavailable: 'The full receipt image is unavailable.',
    logoutFailed: 'Sign-out could not be completed. Local data was removed.',
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
    update: 'Update',
    installTitle: 'Install Bianco',
    installDescription: 'Add it to your home screen for an app-like experience, even offline.',
    install: 'Install',
    notNow: 'Not now'
  }
}
