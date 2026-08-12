export default {
  meta: {
    title: 'Bianco',
    description: 'Recibos claros, incluso sin conexión.'
  },
  brand: {
    tagline: 'Tus recibos, por fin claros',
    homeAria: 'Bianco, resumen'
  },
  common: {
    loadingArchive: 'Abriendo tu archivo local…',
    close: 'Cerrar',
    cancel: 'Cancelar',
    save: 'Guardar',
    confirm: 'Confirmar',
    delete: 'Eliminar',
    retry: 'Reintentar',
    manual: 'Manual',
    notAvailable: '—'
  },
  connection: {
    online: 'En línea',
    offline: 'Sin conexión',
    syncing: 'Sincronizando',
    paused: 'Sincronización pausada',
    localOnly: 'Solo local'
  },
  nav: {
    mainAria: 'Navegación principal',
    dashboard: 'Resumen',
    capture: 'Capturar',
    archive: 'Archivo'
  },
  dashboard: {
    eyebrow: 'Mes actual',
    title: 'Resumen',
    periodSpend: 'Gasto del periodo',
    previousComparison: 'respecto al periodo anterior',
    noPreviousComparison: 'Todavía no hay un periodo anterior comparable',
    savedReceipts: 'Recibos guardados',
    needsAttention: 'Requiere atención',
    reviewReceipts: 'Revisar recibos',
    details: 'Más detalles',
    pendingActivities_one: '{{count}} tarea en cola',
    pendingActivities_other: '{{count}} tareas en cola',
    categories: {
      title: 'Categorías',
      chartAria: 'Gasto por categoría',
      empty: 'Los datos de este mes aparecerán aquí.'
    },
    spendingTrend: {
      title: 'Evolución de los gastos',
      lastPeriods: 'Últimos {{count}} períodos',
      periodAria: 'Agrupación temporal de los gastos',
      weekly: 'Semanas',
      monthly: 'Meses',
      chartAria: 'Gastos a lo largo del tiempo',
      empty: 'Los gastos aparecerán aquí.'
    },
    insights: {
      title: 'Lo más destacado',
      thresholdDescription: 'Se requieren variaciones de al menos {{amount}} y {{percent}} %.',
      empty: 'Todavía no destaca ningún cambio relevante.',
      aiAggregatedOnly: 'Resumen',
      generate: 'Ampliar información',
      refresh: 'Actualizar resumen'
    },
    merchants: {
      title: 'Comercios',
      top: 'Top 5',
      purchases_one: '{{count}} compra',
      purchases_other: '{{count}} compras',
      empty: 'No hay comercios en este periodo.'
    },
    products: {
      title: 'Productos',
      top: 'Top 5',
      units_one: '{{count}} unidad',
      units_other: '{{count}} unidades',
      times_one: '{{count}} vez',
      times_other: '{{count}} veces',
      quantityFrequency: '{{quantity}} · {{frequency}}',
      empty: 'Los productos extraídos aparecerán aquí.'
    },
    prices: {
      title: 'Precios',
      latestVsAverage: 'Último vs. media',
      empty: 'Se necesitan al menos dos precios unitarios.'
    }
  },
  archive: {
    eyebrow: 'En este dispositivo',
    title: 'Archivo',
    addManual: '+ Manual',
    searchPlaceholder: 'Buscar comercio o producto',
    searchAria: 'Buscar',
    categoryFilterAria: 'Filtrar por categoría',
    allCategories: 'Todas las categorías',
    periodFilterAria: 'Filtrar por periodo',
    period: {
      all: 'Todos los periodos',
      currentMonth: 'Mes actual',
      previousMonth: 'Mes anterior',
      currentYear: 'Año actual'
    },
    unknownMerchant: 'Recibo sin comercio',
    empty: {
      title: 'No hay recibos',
      description: 'Fotografía tu primer recibo o introduce un gasto manualmente.',
      capture: 'Capturar'
    }
  },
  capture: {
    eyebrow: 'Guardado local inmediato',
    title: 'Nuevo recibo',
    frameTitle: 'Encuadra todo el recibo',
    frameDescription: 'Enderezamos y recortamos el recibo de forma conservadora, conservando detalles hasta 3200 px.',
    openCamera: 'Abrir cámara',
    chooseGallery: 'Elegir de la galería',
    manual: 'Introducir sin foto',
    preparingPreview: 'Detectando los bordes del recibo…',
    applyingCorrection: 'Recortando y corrigiendo la perspectiva…',
    previewAlt: 'Vista previa del recibo',
    cropDetected: 'Bordes detectados automáticamente',
    cropFallback: 'Coloca el recorte sobre el recibo',
    cropHint: 'Si hace falta, arrastra las cuatro esquinas: la lupa muestra el detalle automáticamente.',
    cropInvalid: 'El contorno se cruza o es demasiado pequeño. Ajusta las esquinas para continuar.',
    cropEditorAria: 'Corrección del recorte del recibo',
    cropCornerAria: 'Esquina del recorte {{index}}',
    retry: 'Repetir',
    confirm: 'Confirmar'
  },
  settings: {
    eyebrow: 'Local de forma predeterminada',
    title: 'Ajustes',
    openAria: 'Ajustes',
    closeAria: 'Cerrar ajustes',
    dialogAria: 'Ajustes de Bianco',
    appearance: {
      title: 'Apariencia',
      themeLabel: 'Tema',
      themeAuto: 'Automático',
      themeLight: 'Claro',
      themeDark: 'Oscuro',
      languageTitle: 'Idioma',
      languageLabel: 'Idioma de la aplicación',
      languageAuto: 'Automático',
      languageEn: 'English',
      languageIt: 'Italiano',
      languageDe: 'Deutsch',
      languageEs: 'Español',
      languageFr: 'Français'
    },
    ai: {
      title: 'Inteligencia artificial',
      unavailableOffline: 'Los proveedores estarán disponibles cuando Bianco vuelva a estar en línea.',
      provider: 'Proveedor de IA',
      chatgptDescription: 'Usa los modelos Codex incluidos en tu suscripción de ChatGPT. No se usan claves API ni facturación de API.',
      connectChatgpt: 'Conectar ChatGPT',
      deviceCode: 'Código OpenAI de un solo uso',
      openOpenAi: 'Abrir OpenAI',
      copyCode: 'Copiar código',
      deviceCodeHint: 'Inicia sesión en OpenAI en la página que se abre e introduce este código. Después puedes volver a Bianco.',
      connectedPlan: 'Plan conectado:',
      model: 'Modelo Codex',
      loadingModels: 'Cargando modelos disponibles…',
      chooseModel: 'Elige un modelo',
      recommended: 'Recomendado',
      disconnectChatgpt: 'Desconectar ChatGPT',
      endpoint: 'Dirección del proveedor',
      ollamaEndpointHint: 'La dirección debe ser accesible desde el contenedor de la API. Usa la IP del servidor Ollama o un nombre de host compatible con el runtime de contenedores.',
      apiKey: 'Clave API',
      apiKeyOptional: 'Clave API (opcional)',
      savedKeyPlaceholder: 'Clave guardada',
      newKeyPlaceholder: 'Introduce la clave API',
      removeSavedKey: 'Eliminar la clave guardada',
      active: 'En uso:',
      securityNote: 'Las credenciales de ChatGPT permanecen en el backend y nunca se envían a la PWA. Las claves OpenAI-compatible se cifran en el servidor y se eliminan de la memoria del formulario.'
    },
    insights: {
      title: 'Análisis',
      minimumPercent: 'Umbral porcentual mínimo',
      minimumAmount: 'Umbral absoluto mínimo ({{currency}})',
      apply: 'Aplicar umbrales'
    },
    backup: {
      title: 'Exportar este dispositivo',
      includeImages: 'Incluir imágenes en el JSON',
      export: 'Exportar JSON',
      estimatedSpace: 'Uso local: {{usage}}. La exportación contiene datos, no imágenes ni una copia restaurable del servidor.'
    },
    account: {
      title: 'Cuenta',
      description: 'Cierra la sesión autenticada en este dispositivo.',
      signOut: 'Cerrar sesión',
      signOutAndDelete: 'Cerrar sesión y eliminar los datos de este dispositivo'
    },
    privacy: {
      title: 'Privacidad y datos',
      description: 'Elimina recibos, imágenes, tareas y ajustes solo de este dispositivo.',
      deleteAll: 'Restablecer este dispositivo'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Otro / compatible con OpenAI'
    },
    enterEndpoint: 'Introduce la dirección del proveedor.',
    enterApiKey: 'Introduce la clave API para conectar el proveedor.',
    connectChatgpt: 'Conecta tu suscripción de ChatGPT para continuar.',
    startingChatgptLogin: 'Iniciando el acceso seguro a OpenAI…',
    waitingChatgptLogin: 'Esperando la autorización de OpenAI…',
    chooseModel: 'Elige uno de los modelos Codex disponibles para tu cuenta.',
    noModels: 'No hay modelos Codex con imágenes disponibles para esta cuenta.',
    modelsUnavailable: 'La lista de modelos Codex no está disponible ahora.',
    activatingModel: 'Activando el modelo seleccionado…',
    chatgptLoginFailed: 'No se pudo completar la conexión con ChatGPT.',
    chatgptLoginExpired: 'El código OpenAI ha caducado. Inicia una nueva conexión.',
    chatgptLogoutFailed: 'No se pudo desconectar ChatGPT.',
    checking: 'Comprobando la conexión…',
    providerActive: '{{provider}} está conectado y activo.',
    backendUnavailable: 'El proveedor o la configuración de IA del backend no están disponibles.',
    unreachable: 'No se puede acceder al proveedor. Comprueba la dirección e inténtalo de nuevo.',
    activationFailed: 'No se ha podido activar el proveedor. Comprueba la configuración e inténtalo de nuevo.'
  },
  receiptDetail: {
    title: 'Revisar recibo',
    close: 'Cerrar',
    photoAlt: 'Fotografía del recibo',
    openFullImage: 'Abrir imagen completa',
    loadingFullImage: 'Cargando imagen completa…',
    fullImageTitle: 'Imagen completa del recibo',
    closeFullImage: 'Cerrar imagen completa',
    noLocalImage: 'No hay imagen local',
    retryProcessing: 'Reintentar procesamiento',
    reanalyze: 'Reanalizar con IA',
    magnifierHint: 'Mueve el ratón sobre la imagen; en pantalla táctil, mantén pulsado y arrastra.',
    merchant: 'Comercio',
    merchantPlaceholder: 'Nombre del comercio',
    date: 'Fecha',
    total: 'Total ({{currency}})',
    category: 'Categoría',
    currency: 'Moneda',
    products: 'Productos',
    addProduct: '+ Producto',
    productPlaceholder: 'Producto',
    quantityPlaceholder: 'Cant.',
    unitPricePlaceholder: '{{currency}}/unidad',
    productTotalPlaceholder: 'Total {{currency}}',
    productNameAria: 'Nombre del producto {{index}}',
    quantityAria: 'Cantidad {{index}}',
    unitPriceAria: 'Precio unitario {{index}}',
    productTotalAria: 'Total del producto {{index}}',
    productCategoryAria: 'Categoría del producto {{index}}',
    deleteProductAria: 'Eliminar producto {{index}}',
    noProducts: 'No hay productos. Puedes añadirlos manualmente.',
    delete: 'Eliminar',
    save: 'Guardar'
  },
  receiptStatus: {
    captured: 'Capturado',
    queued: 'En cola',
    processing: 'Analizando',
    needsReview: 'Por revisar',
    confirmed: 'Confirmado',
    failed: 'Fallido',
    manual: 'Manual'
  },
  category: {
    foodGrocery: 'Alimentación',
    restaurant: 'Restauración',
    transport: 'Transporte',
    home: 'Hogar',
    health: 'Salud',
    personal: 'Personal',
    entertainment: 'Ocio',
    other: 'Otros'
  },
  insight: {
    categoryIncreased: 'El gasto en {{category}} ha aumentado un {{percent}} %.',
    categoryDecreased: 'El gasto en {{category}} ha disminuido un {{percent}} %.',
    merchantMore: 'Has gastado {{amount}} más en {{merchant}}.',
    merchantLess: 'Has gastado {{amount}} menos en {{merchant}}.',
    frequency_one: '{{product}} se ha comprado {{count}} vez.',
    frequency_other: '{{product}} se ha comprado {{count}} veces.',
    priceIncreased: 'El precio de {{product}} ha aumentado un {{percent}} %.',
    priceDecreased: 'El precio de {{product}} ha disminuido un {{percent}} %.'
  },
  date: {
    unknown: 'Fecha por revisar'
  },
  storage: {
    usage: '{{used}} MB de {{quota}} MB'
  },
  notification: {
    offlineReady: 'Bianco está listo para usarse sin conexión.',
    receiptSaved: 'Recibo guardado.',
    receiptConfirmed: 'Recibo confirmado.',
    changesSaved: 'Cambios guardados.',
    receiptDeleted: 'Recibo eliminado.',
    processingQueued: 'Procesamiento añadido de nuevo a la cola.',
    analysisCompleted: 'Análisis completado: revisa el resultado.',
    thresholdsUpdated: 'Umbrales actualizados.',
    summarySaved: 'Resumen guardado localmente.',
    updateDeferred: 'Actualización lista. Termina la edición actual y luego actualiza.',
    backupCreated: 'Exportación JSON creada.',
    codeCopied: 'Código OpenAI copiado.',
    chatgptDisconnected: 'ChatGPT desconectado.'
  },
  confirm: {
    reanalyzeReceiptTitle: 'Reanalizar recibo',
    reanalyzeReceipt: '¿Procesar de nuevo la foto con el modelo de IA activo? Los datos extraídos y las correcciones confirmadas serán sustituidos por el nuevo resultado.',
    deleteReceiptTitle: 'Eliminar recibo',
    deleteReceipt: '¿Eliminar este recibo y su imagen local?',
    deleteAllDataTitle: 'Eliminar datos locales',
    deleteAllData: '¿Eliminar definitivamente todos los datos de Bianco de este dispositivo?',
    logoutAndDeleteTitle: 'Cerrar sesión y eliminar datos locales',
    logoutAndDelete: '¿Cerrar sesión y eliminar definitivamente de este dispositivo los datos e imágenes de recibos? Los datos del servidor no se eliminarán.'
  },
  warning: {
    incompleteImageSave: 'La imagen no se ha guardado por completo.'
  },
  error: {
    databaseOpen: 'No se ha podido abrir el archivo local.',
    secureContextRequired: 'Abre Bianco mediante HTTPS o localhost para usar el archivo local y las funciones sin conexión.',
    invalidImage: 'Elige un archivo de imagen.',
    imageTooLarge: 'La imagen supera los 10 MB. Elige una foto más pequeña.',
    saveFailed: 'No se han podido guardar los cambios.',
    receiptConflict: 'Este recibo se ha modificado en otro dispositivo. Se ha detenido el guardado para no sobrescribirlo; tus cambios siguen visibles aquí.',
    imageUnavailable: 'La imagen no está disponible.',
    invalidConfiguration: 'La configuración no es válida.',
    backendUnavailable: 'No se puede acceder al backend de Bianco.',
    summaryUnavailable: 'El resumen no está disponible.',
    backupFailed: 'No se ha podido crear la copia de seguridad.',
    receiptImageMissing: 'Falta la imagen del recibo.',
    fullReceiptImageUnavailable: 'La imagen completa del recibo no está disponible.',
    logoutFailed: 'No se pudo completar el cierre de sesión. Se eliminaron los datos locales.',
    imageMetadataMissing: 'Falta la información de la imagen.',
    fullImageAttachmentMissing: 'Falta la imagen completa.',
    receiptNotFound: 'No se ha encontrado el recibo.',
    jpegEncodingFailed: 'No se ha podido preparar la imagen.',
    requestFailed: 'No se ha podido completar la solicitud.',
    unexpected: 'Se ha producido un error. Inténtalo de nuevo.'
  },
  pwa: {
    offlineReady: 'Bianco está listo para usarse sin conexión.',
    updateAvailable: 'Hay una nueva versión disponible.',
    update: 'Actualizar',
    installTitle: 'Instalar Bianco',
    installDescription: 'Añádelo a la pantalla de inicio para usarlo como una aplicación, incluso sin conexión.',
    install: 'Instalar',
    notNow: 'Ahora no'
  }
}
