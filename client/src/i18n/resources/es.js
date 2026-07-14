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
    savedReceipts: 'Recibos guardados',
    pendingActivities_one: '{{count}} tarea en cola',
    pendingActivities_other: '{{count}} tareas en cola',
    categories: {
      title: 'Categorías',
      chartAria: 'Gasto por categoría',
      empty: 'Los datos de este mes aparecerán aquí.'
    },
    insights: {
      title: 'Lo más destacado',
      local: 'Cálculo local',
      thresholdDescription: 'Se requieren variaciones de al menos {{amount}} y {{percent}} %.',
      aiAggregatedOnly: 'Resumen de IA · solo datos agregados',
      generate: 'Generar resumen'
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
    frameDescription: 'Corregimos la orientación y el tamaño y guardamos una copia JPEG de menos de 2200 px.',
    openCamera: 'Abrir cámara',
    chooseGallery: 'Elegir de la galería',
    manual: 'Introducir sin foto',
    previewAlt: 'Vista previa del recibo',
    retry: 'Repetir',
    save: 'Guardar',
    privacyNote: 'La foto permanece en la base de datos local. Solo se envía al backend si configuras y activas los servicios relacionados.'
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
      endpoint: 'Dirección del proveedor',
      ollamaEndpointHint: 'La dirección debe ser accesible desde el contenedor de la API. Usa la IP del servidor Ollama o un nombre de host compatible con el runtime de contenedores.',
      apiKey: 'Clave API',
      apiKeyOptional: 'Clave API (opcional)',
      savedKeyPlaceholder: 'Clave guardada',
      newKeyPlaceholder: 'Introduce la clave API',
      removeSavedKey: 'Eliminar la clave guardada',
      model: 'Modelo',
      modelSearching: 'Buscando modelos…',
      modelChoose: 'Elige un modelo',
      modelNone: 'No hay modelos disponibles',
      active: 'En uso:',
      securityNote: 'Los endpoints y los modelos se comprueban automáticamente. Las claves API se cifran en el servidor y se eliminan de la memoria del formulario después de guardarlas.'
    },
    insights: {
      title: 'Análisis',
      minimumPercent: 'Umbral porcentual mínimo',
      minimumAmount: 'Umbral absoluto mínimo ({{currency}})',
      apply: 'Aplicar umbrales'
    },
    backup: {
      title: 'Copia de seguridad local',
      includeImages: 'Incluir imágenes en el JSON',
      export: 'Exportar JSON',
      estimatedSpace: 'Espacio estimado: {{usage}}'
    },
    privacy: {
      title: 'Privacidad y datos',
      description: 'Elimina recibos, imágenes, tareas y ajustes solo de este dispositivo.',
      deleteAll: 'Eliminar todos los datos locales'
    }
  },
  provider: {
    name: {
      openai: 'OpenAI',
      ollama: 'Ollama',
      openaiCompatible: 'Otro / compatible con OpenAI'
    },
    enterEndpoint: 'Introduce la dirección del proveedor.',
    enterApiKey: 'Introduce la clave API para cargar los modelos.',
    checking: 'Comprobando la conexión…',
    checkingModels: 'Comprobando la conexión y buscando modelos…',
    modelsAvailable_one: '{{count}} modelo disponible.',
    modelsAvailable_other: '{{count}} modelos disponibles.',
    modelsActive_one: '{{provider}} · {{model}} está activo. {{count}} modelo disponible.',
    modelsActive_other: '{{provider}} · {{model}} está activo. {{count}} modelos disponibles.',
    selectAvailable_one: '{{count}} modelo disponible. Selecciónalo para activarlo inmediatamente.',
    selectAvailable_other: '{{count}} modelos disponibles. Elige uno para activarlo inmediatamente.',
    noModels: 'La conexión funciona, pero el proveedor no ofrece modelos.',
    unreachable: 'No se puede acceder al proveedor. Comprueba la dirección e inténtalo de nuevo.',
    activating: 'Configurando el modelo…',
    modelActive: '{{provider}} · {{model}} es ahora el modelo de Bianco.',
    modelUnavailable: 'El modelo seleccionado no está disponible.',
    activationFailed: 'No se ha podido activar el modelo. Comprueba la configuración e inténtalo de nuevo.'
  },
  receiptDetail: {
    title: 'Revisar recibo',
    close: 'Cerrar',
    photoAlt: 'Fotografía del recibo',
    fullImageStored: 'Imagen completa guardada localmente',
    openFullImage: 'Abrir imagen completa',
    noLocalImage: 'No hay imagen local',
    retryProcessing: 'Reintentar procesamiento',
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
    backupCreated: 'Copia JSON creada.'
  },
  confirm: {
    deleteReceiptTitle: 'Eliminar recibo',
    deleteReceipt: '¿Eliminar este recibo y su imagen local?',
    deleteAllDataTitle: 'Eliminar datos locales',
    deleteAllData: '¿Eliminar definitivamente todos los datos de Bianco de este dispositivo?'
  },
  warning: {
    incompleteImageSave: 'La imagen no se ha guardado por completo.'
  },
  error: {
    databaseOpen: 'No se ha podido abrir el archivo local.',
    secureContextRequired: 'Abre Bianco mediante HTTPS o localhost para usar el archivo local y las funciones sin conexión.',
    invalidImage: 'Elige un archivo de imagen.',
    saveFailed: 'No se han podido guardar los cambios.',
    imageUnavailable: 'La imagen no está disponible.',
    invalidConfiguration: 'La configuración no es válida.',
    backendUnavailable: 'No se puede acceder al backend de Bianco.',
    summaryUnavailable: 'El resumen no está disponible.',
    backupFailed: 'No se ha podido crear la copia de seguridad.',
    receiptImageMissing: 'Falta la imagen del recibo.',
    fullReceiptImageUnavailable: 'La imagen completa del recibo no está disponible.',
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
