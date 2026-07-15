export default {
  meta: {
    title: 'Bianco',
    description: 'Des tickets clairs, même hors ligne.'
  },
  brand: {
    tagline: 'Vos tickets, enfin clairs',
    homeAria: 'Bianco, vue d’ensemble'
  },
  common: {
    loadingArchive: 'Ouverture de votre archive locale…',
    close: 'Fermer',
    cancel: 'Annuler',
    save: 'Enregistrer',
    confirm: 'Confirmer',
    delete: 'Supprimer',
    retry: 'Réessayer',
    manual: 'Manuel',
    notAvailable: '—'
  },
  connection: {
    online: 'En ligne',
    offline: 'Hors ligne',
    syncing: 'Synchronisation',
    paused: 'Synchronisation suspendue',
    localOnly: 'Local uniquement'
  },
  nav: {
    mainAria: 'Navigation principale',
    dashboard: 'Vue d’ensemble',
    capture: 'Capturer',
    archive: 'Archives'
  },
  dashboard: {
    eyebrow: 'Mois en cours',
    title: 'Vue d’ensemble',
    periodSpend: 'Dépenses de la période',
    previousComparison: 'par rapport à la période précédente',
    savedReceipts: 'Tickets enregistrés',
    pendingActivities_one: '{{count}} tâche en attente',
    pendingActivities_other: '{{count}} tâches en attente',
    categories: {
      title: 'Catégories',
      chartAria: 'Dépenses par catégorie',
      empty: 'Les données de ce mois apparaîtront ici.'
    },
    insights: {
      title: 'Points marquants',
      local: 'Calcul local',
      thresholdDescription: 'Des variations d’au moins {{amount}} et {{percent}} % sont nécessaires.',
      aiAggregatedOnly: 'Résumé IA · données agrégées uniquement',
      generate: 'Générer le résumé'
    },
    merchants: {
      title: 'Commerçants',
      top: 'Top 5',
      purchases_one: '{{count}} achat',
      purchases_other: '{{count}} achats',
      empty: 'Aucun commerçant sur cette période.'
    },
    products: {
      title: 'Produits',
      top: 'Top 5',
      units_one: '{{count}} unité',
      units_other: '{{count}} unités',
      times_one: '{{count}} fois',
      times_other: '{{count}} fois',
      quantityFrequency: '{{quantity}} · {{frequency}}',
      empty: 'Les produits extraits apparaîtront ici.'
    },
    prices: {
      title: 'Prix',
      latestVsAverage: 'Dernier vs moyenne',
      empty: 'Au moins deux prix unitaires sont nécessaires.'
    }
  },
  archive: {
    eyebrow: 'Sur cet appareil',
    title: 'Archives',
    addManual: '+ Manuel',
    searchPlaceholder: 'Rechercher un commerçant ou un produit',
    searchAria: 'Rechercher',
    categoryFilterAria: 'Filtrer par catégorie',
    allCategories: 'Toutes les catégories',
    periodFilterAria: 'Filtrer par période',
    period: {
      all: 'Toutes les périodes',
      currentMonth: 'Mois en cours',
      previousMonth: 'Mois précédent',
      currentYear: 'Année en cours'
    },
    unknownMerchant: 'Ticket sans commerçant',
    empty: {
      title: 'Aucun ticket',
      description: 'Photographiez votre premier ticket ou saisissez une dépense manuellement.',
      capture: 'Capturer'
    }
  },
  capture: {
    eyebrow: 'Enregistrement local immédiat',
    title: 'Nouveau ticket',
    frameTitle: 'Cadrez le ticket en entier',
    frameDescription: 'Nous corrigeons son orientation et sa taille, puis conservons une copie JPEG de moins de 2200 px.',
    openCamera: 'Ouvrir l’appareil photo',
    chooseGallery: 'Choisir dans la galerie',
    manual: 'Saisir sans photo',
    previewAlt: 'Aperçu du ticket',
    retry: 'Reprendre',
    save: 'Enregistrer',
    privacyNote: 'La photo reste dans la base de données locale. Elle est envoyée au backend uniquement si vous configurez et activez les services associés.'
  },
  settings: {
    eyebrow: 'Local par défaut',
    title: 'Paramètres',
    openAria: 'Paramètres',
    closeAria: 'Fermer les paramètres',
    dialogAria: 'Paramètres de Bianco',
    appearance: {
      title: 'Apparence',
      themeLabel: 'Thème',
      themeAuto: 'Automatique',
      themeLight: 'Clair',
      themeDark: 'Sombre',
      languageTitle: 'Langue',
      languageLabel: 'Langue de l’application',
      languageAuto: 'Automatique',
      languageEn: 'English',
      languageIt: 'Italiano',
      languageDe: 'Deutsch',
      languageEs: 'Español',
      languageFr: 'Français'
    },
    ai: {
      title: 'Intelligence artificielle',
      unavailableOffline: 'Les fournisseurs seront disponibles lorsque Bianco sera de nouveau en ligne.',
      provider: 'Fournisseur IA',
      endpoint: 'Adresse du fournisseur',
      ollamaEndpointHint: 'L’adresse doit être accessible depuis le conteneur API. Utilisez l’IP du serveur Ollama ou un nom d’hôte pris en charge par votre environnement de conteneurs.',
      apiKey: 'Clé API',
      apiKeyOptional: 'Clé API (facultative)',
      savedKeyPlaceholder: 'Clé enregistrée',
      newKeyPlaceholder: 'Saisissez la clé API',
      removeSavedKey: 'Supprimer la clé enregistrée',
      model: 'Modèle',
      modelSearching: 'Recherche des modèles…',
      modelChoose: 'Choisir un modèle',
      modelNone: 'Aucun modèle disponible',
      active: 'En cours d’utilisation :',
      securityNote: 'Les points d’accès et les modèles sont vérifiés automatiquement. Les clés API sont chiffrées sur le serveur et effacées de la mémoire du formulaire après l’enregistrement.'
    },
    insights: {
      title: 'Analyses',
      minimumPercent: 'Seuil minimal en pourcentage',
      minimumAmount: 'Seuil absolu minimal ({{currency}})',
      apply: 'Appliquer les seuils'
    },
    backup: {
      title: 'Sauvegarde locale',
      includeImages: 'Inclure les images dans le JSON',
      export: 'Exporter le JSON',
      estimatedSpace: 'Espace estimé : {{usage}}'
    },
    account: {
      title: 'Compte',
      description: 'Terminez la session authentifiée sur cet appareil.',
      signOut: 'Se déconnecter'
    },
    privacy: {
      title: 'Confidentialité et données',
      description: 'Supprimez les tickets, images, tâches et paramètres de cet appareil uniquement.',
      deleteAll: 'Supprimer toutes les données locales'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Autre / compatible OpenAI'
    },
    enterEndpoint: 'Saisissez l’adresse du fournisseur.',
    enterApiKey: 'Saisissez la clé API pour charger les modèles.',
    checking: 'Vérification de la connexion…',
    checkingModels: 'Vérification de la connexion et recherche des modèles…',
    modelsAvailable_one: '{{count}} modèle disponible.',
    modelsAvailable_other: '{{count}} modèles disponibles.',
    modelsActive_one: '{{provider}} · {{model}} est actif. {{count}} modèle disponible.',
    modelsActive_other: '{{provider}} · {{model}} est actif. {{count}} modèles disponibles.',
    selectAvailable_one: '{{count}} modèle disponible. Sélectionnez-le pour l’activer immédiatement.',
    selectAvailable_other: '{{count}} modèles disponibles. Choisissez-en un pour l’activer immédiatement.',
    noModels: 'La connexion fonctionne, mais le fournisseur ne propose aucun modèle.',
    unreachable: 'Le fournisseur est inaccessible. Vérifiez l’adresse et réessayez.',
    activating: 'Activation du modèle…',
    modelActive: '{{provider}} · {{model}} est désormais le modèle de Bianco.',
    modelUnavailable: 'Le modèle sélectionné n’est pas disponible.',
    activationFailed: 'Le modèle n’a pas pu être activé. Vérifiez la configuration et réessayez.'
  },
  receiptDetail: {
    title: 'Vérifier le ticket',
    close: 'Fermer',
    photoAlt: 'Photo du ticket de caisse',
    fullImageStored: 'Image complète conservée localement',
    openFullImage: 'Ouvrir l’image complète',
    noLocalImage: 'Aucune image locale',
    retryProcessing: 'Relancer le traitement',
    merchant: 'Commerçant',
    merchantPlaceholder: 'Nom du commerçant',
    date: 'Date',
    total: 'Total ({{currency}})',
    category: 'Catégorie',
    currency: 'Devise',
    products: 'Produits',
    addProduct: '+ Produit',
    productPlaceholder: 'Produit',
    quantityPlaceholder: 'Qté',
    unitPricePlaceholder: '{{currency}}/unité',
    productTotalPlaceholder: 'Total {{currency}}',
    productNameAria: 'Nom du produit {{index}}',
    quantityAria: 'Quantité {{index}}',
    unitPriceAria: 'Prix unitaire {{index}}',
    productTotalAria: 'Total du produit {{index}}',
    deleteProductAria: 'Supprimer le produit {{index}}',
    noProducts: 'Aucun produit. Vous pouvez les ajouter manuellement.',
    delete: 'Supprimer',
    save: 'Enregistrer'
  },
  receiptStatus: {
    captured: 'Capturé',
    queued: 'En attente',
    processing: 'Analyse',
    needsReview: 'À vérifier',
    confirmed: 'Confirmé',
    failed: 'Échec',
    manual: 'Manuel'
  },
  category: {
    foodGrocery: 'Courses alimentaires',
    restaurant: 'Restauration',
    transport: 'Transports',
    home: 'Maison',
    health: 'Santé',
    personal: 'Personnel',
    entertainment: 'Loisirs',
    other: 'Autre'
  },
  insight: {
    categoryIncreased: 'Les dépenses en {{category}} ont augmenté de {{percent}} %.',
    categoryDecreased: 'Les dépenses en {{category}} ont diminué de {{percent}} %.',
    merchantMore: 'Vous avez dépensé {{amount}} de plus chez {{merchant}}.',
    merchantLess: 'Vous avez dépensé {{amount}} de moins chez {{merchant}}.',
    frequency_one: '{{product}} a été acheté {{count}} fois.',
    frequency_other: '{{product}} a été acheté {{count}} fois.',
    priceIncreased: 'Le prix de {{product}} a augmenté de {{percent}} %.',
    priceDecreased: 'Le prix de {{product}} a diminué de {{percent}} %.'
  },
  date: {
    unknown: 'Date à vérifier'
  },
  storage: {
    usage: '{{used}} Mo sur {{quota}} Mo'
  },
  notification: {
    offlineReady: 'Bianco est prêt à être utilisé hors ligne.',
    receiptSaved: 'Ticket enregistré.',
    receiptConfirmed: 'Ticket confirmé.',
    changesSaved: 'Modifications enregistrées.',
    receiptDeleted: 'Ticket supprimé.',
    processingQueued: 'Traitement remis en attente.',
    analysisCompleted: 'Analyse terminée : vérifiez le résultat.',
    thresholdsUpdated: 'Seuils mis à jour.',
    summarySaved: 'Résumé enregistré localement.',
    backupCreated: 'Sauvegarde JSON créée.'
  },
  confirm: {
    deleteReceiptTitle: 'Supprimer le ticket',
    deleteReceipt: 'Supprimer ce ticket et son image locale ?',
    deleteAllDataTitle: 'Supprimer les données locales',
    deleteAllData: 'Supprimer définitivement toutes les données de Bianco de cet appareil ?'
  },
  warning: {
    incompleteImageSave: 'L’image n’a pas été entièrement enregistrée.'
  },
  error: {
    databaseOpen: 'L’archive locale n’a pas pu être ouverte.',
    secureContextRequired: 'Ouvrez Bianco via HTTPS ou localhost pour utiliser l’archive locale et les fonctions hors ligne.',
    invalidImage: 'Choisissez un fichier image.',
    saveFailed: 'Les modifications n’ont pas pu être enregistrées.',
    imageUnavailable: 'L’image n’est pas disponible.',
    invalidConfiguration: 'La configuration n’est pas valide.',
    backendUnavailable: 'Le backend de Bianco est inaccessible.',
    summaryUnavailable: 'Le résumé n’est pas disponible.',
    backupFailed: 'La sauvegarde n’a pas pu être créée.',
    receiptImageMissing: 'L’image du ticket est manquante.',
    fullReceiptImageUnavailable: 'L’image complète du ticket n’est pas disponible.',
    imageMetadataMissing: 'Les informations de l’image sont manquantes.',
    fullImageAttachmentMissing: 'L’image complète est manquante.',
    receiptNotFound: 'Le ticket est introuvable.',
    jpegEncodingFailed: 'L’image n’a pas pu être préparée.',
    requestFailed: 'La demande n’a pas pu être effectuée.',
    unexpected: 'Une erreur s’est produite. Réessayez.'
  },
  pwa: {
    offlineReady: 'Bianco est prêt à être utilisé hors ligne.',
    updateAvailable: 'Une nouvelle version est disponible.',
    update: 'Mettre à jour',
    installTitle: 'Installer Bianco',
    installDescription: 'Ajoutez Bianco à l’écran d’accueil pour l’utiliser comme une application, même hors ligne.',
    install: 'Installer',
    notNow: 'Plus tard'
  }
}
