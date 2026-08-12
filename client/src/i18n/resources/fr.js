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
    noPreviousComparison: 'Aucune période précédente comparable pour le moment',
    otherCurrenciesExcluded_one: '{{count}} ticket dans une autre devise est exclu',
    otherCurrenciesExcluded_other: '{{count}} tickets dans d’autres devises sont exclus',
    savedReceipts: 'Tickets enregistrés',
    needsAttention: 'À vérifier',
    reviewReceipts: 'Vérifier les tickets',
    details: 'Plus de détails',
    pendingActivities_one: '{{count}} tâche en attente',
    pendingActivities_other: '{{count}} tâches en attente',
    categories: {
      title: 'Catégories',
      chartAria: 'Dépenses par catégorie',
      empty: 'Les données de ce mois apparaîtront ici.'
    },
    spendingTrend: {
      title: 'Évolution des dépenses',
      lastPeriods: '{{count}} dernières périodes',
      periodAria: 'Regroupement temporel des dépenses',
      weekly: 'Semaines',
      monthly: 'Mois',
      chartAria: 'Dépenses dans le temps',
      empty: 'Les dépenses apparaîtront ici.'
    },
    insights: {
      title: 'Points marquants',
      thresholdDescription: 'Des variations d’au moins {{amount}} et {{percent}} % sont nécessaires.',
      empty: 'Aucune évolution notable pour le moment.',
      aiAggregatedOnly: 'Synthèse',
      generate: 'Approfondir',
      refresh: 'Actualiser la synthèse'
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
    frameDescription: 'Nous redressons et recadrons prudemment le ticket, en préservant les détails jusqu’à 3200 px.',
    openCamera: 'Ouvrir l’appareil photo',
    chooseGallery: 'Choisir dans la galerie',
    manual: 'Saisir sans photo',
    preparingPreview: 'Détection des bords du ticket…',
    applyingCorrection: 'Recadrage et correction de la perspective…',
    previewAlt: 'Aperçu du ticket',
    cropDetected: 'Bords détectés automatiquement',
    cropFallback: 'Placez le recadrage sur le ticket',
    cropHint: 'Si nécessaire, déplacez les quatre coins : la loupe affiche automatiquement le détail.',
    cropInvalid: 'Le contour se croise ou est trop petit. Ajustez les coins pour continuer.',
    cropEditorAria: 'Correction du recadrage du ticket',
    cropCornerAria: 'Coin du recadrage {{index}}',
    retry: 'Reprendre',
    confirm: 'Confirmer'
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
      chatgptDescription: 'Utilisez les modèles Codex inclus dans votre abonnement ChatGPT. Aucune clé API ni facturation API n’est utilisée.',
      connectChatgpt: 'Connecter ChatGPT',
      deviceCode: 'Code OpenAI à usage unique',
      openOpenAi: 'Ouvrir OpenAI',
      copyCode: 'Copier le code',
      deviceCodeHint: 'Connectez-vous à OpenAI dans la page qui s’ouvre et saisissez ce code. Revenez ensuite dans Bianco.',
      connectedPlan: 'Offre connectée :',
      disconnectChatgpt: 'Déconnecter ChatGPT',
      endpoint: 'Adresse du fournisseur',
      ollamaEndpointHint: 'L’adresse doit être accessible depuis le conteneur API. Utilisez l’IP du serveur Ollama ou un nom d’hôte pris en charge par votre environnement de conteneurs.',
      apiKey: 'Clé API',
      apiKeyOptional: 'Clé API (facultative)',
      savedKeyPlaceholder: 'Clé enregistrée',
      newKeyPlaceholder: 'Saisissez la clé API',
      removeSavedKey: 'Supprimer la clé enregistrée',
      active: 'En cours d’utilisation :',
      securityNote: 'Les identifiants ChatGPT restent sur le backend et ne sont jamais envoyés à la PWA. Les clés OpenAI-compatible sont chiffrées sur le serveur et effacées de la mémoire du formulaire.'
    },
    insights: {
      title: 'Analyses',
      minimumPercent: 'Seuil minimal en pourcentage',
      minimumAmount: 'Seuil absolu minimal ({{currency}})',
      apply: 'Appliquer les seuils'
    },
    backup: {
      title: 'Exporter cet appareil',
      includeImages: 'Inclure les images dans le JSON',
      export: 'Exporter le JSON',
      estimatedSpace: 'Usage local : {{usage}}. L’export contient les données, pas les images ni une sauvegarde serveur restaurable.'
    },
    account: {
      title: 'Compte',
      description: 'Terminez la session authentifiée sur cet appareil.',
      signOut: 'Se déconnecter',
      signOutAndDelete: 'Se déconnecter et supprimer les données de cet appareil'
    },
    privacy: {
      title: 'Confidentialité et données',
      description: 'Supprimez les tickets, images, tâches et paramètres de cet appareil uniquement.',
      deleteAll: 'Réinitialiser cet appareil'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Autre / compatible OpenAI'
    },
    enterEndpoint: 'Saisissez l’adresse du fournisseur.',
    enterApiKey: 'Saisissez la clé API pour connecter le fournisseur.',
    connectChatgpt: 'Connectez votre abonnement ChatGPT pour continuer.',
    startingChatgptLogin: 'Démarrage de la connexion OpenAI sécurisée…',
    waitingChatgptLogin: 'En attente de l’autorisation OpenAI…',
    chatgptLoginFailed: 'La connexion à ChatGPT n’a pas pu aboutir.',
    chatgptLoginExpired: 'Le code OpenAI a expiré. Démarrez une nouvelle connexion.',
    chatgptLogoutFailed: 'ChatGPT n’a pas pu être déconnecté.',
    checking: 'Vérification de la connexion…',
    providerActive: '{{provider}} est connecté et actif.',
    backendUnavailable: 'Le fournisseur ou la configuration IA du backend est indisponible.',
    unreachable: 'Le fournisseur est inaccessible. Vérifiez l’adresse et réessayez.',
    activationFailed: 'Le fournisseur n’a pas pu être activé. Vérifiez la configuration et réessayez.'
  },
  receiptDetail: {
    title: 'Vérifier le ticket',
    close: 'Fermer',
    photoAlt: 'Photo du ticket de caisse',
    openFullImage: 'Ouvrir l’image complète',
    loadingFullImage: 'Chargement de l’image complète…',
    fullImageTitle: 'Image complète du ticket',
    closeFullImage: 'Fermer l’image complète',
    noLocalImage: 'Aucune image locale',
    retryProcessing: 'Relancer le traitement',
    reanalyze: 'Réanalyser avec l’IA',
    magnifierHint: 'Déplacez la souris sur l’image ; sur écran tactile, maintenez et faites glisser.',
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
    productCategoryAria: 'Catégorie du produit {{index}}',
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
    updateDeferred: 'Mise à jour prête. Terminez la modification en cours, puis actualisez.',
    backupCreated: 'Export JSON créé.',
    codeCopied: 'Code OpenAI copié.',
    chatgptDisconnected: 'ChatGPT déconnecté.'
  },
  confirm: {
    reanalyzeReceiptTitle: 'Réanalyser le ticket',
    reanalyzeReceipt: 'Traiter à nouveau la photo avec le modèle IA actif ? Les données extraites et les corrections confirmées seront remplacées par le nouveau résultat.',
    deleteReceiptTitle: 'Supprimer le ticket',
    deleteReceipt: 'Supprimer ce ticket et son image locale ?',
    deleteAllDataTitle: 'Supprimer les données locales',
    deleteAllData: 'Supprimer définitivement toutes les données de Bianco de cet appareil ?',
    logoutAndDeleteTitle: 'Se déconnecter et supprimer les données locales',
    logoutAndDelete: 'Se déconnecter et supprimer définitivement de cet appareil les données et images des tickets ? Les données du serveur ne seront pas supprimées.'
  },
  warning: {
    incompleteImageSave: 'L’image n’a pas été entièrement enregistrée.'
  },
  error: {
    databaseOpen: 'L’archive locale n’a pas pu être ouverte.',
    secureContextRequired: 'Ouvrez Bianco via HTTPS ou localhost pour utiliser l’archive locale et les fonctions hors ligne.',
    invalidImage: 'Choisissez un fichier image.',
    imageTooLarge: 'Cette image dépasse 10 Mo. Choisissez une photo plus petite.',
    saveFailed: 'Les modifications n’ont pas pu être enregistrées.',
    receiptConflict: 'Ce reçu a été modifié sur un autre appareil. L’enregistrement a été interrompu pour éviter de l’écraser ; vos modifications restent visibles ici.',
    imageUnavailable: 'L’image n’est pas disponible.',
    invalidConfiguration: 'La configuration n’est pas valide.',
    backendUnavailable: 'Le backend de Bianco est inaccessible.',
    summaryUnavailable: 'Le résumé n’est pas disponible.',
    backupFailed: 'La sauvegarde n’a pas pu être créée.',
    receiptImageMissing: 'L’image du ticket est manquante.',
    fullReceiptImageUnavailable: 'L’image complète du ticket n’est pas disponible.',
    logoutFailed: 'La déconnexion n’a pas pu être finalisée. Les données locales ont été supprimées.',
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
