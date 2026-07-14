import { generatedInsightsSchema } from './ai/schemas.js'
import { downloadRemoteImage, recoverInterruptedJobs, runPendingJobs } from './ai/jobs.js'
import { getDatabase, deleteLocalDatabase } from './db/index.js'
import { processReceiptImage } from './images/process.js'
import { getImageUrl } from './images/repository.js'
import { i18next, localeForLanguage, resolveLanguage, setLanguage } from './i18n/index.js'
import { computeInsights, insightSnapshot, UNKNOWN_MERCHANT_ID } from './insights/compute.js'
import { categories, categoryMap } from './stores/categories.js'
import {
  createCapturedReceipt,
  createManualReceipt,
  deleteReceipt,
  getReceiptDetail,
  observeItems,
  observeReceipts,
  replaceReceiptItems,
  updateReceipt
} from './stores/receipts.js'
import { apiFetch } from './sync/api.js'
import { resyncNow, startReplication } from './sync/replication.js'
import { downloadBackup } from './utils/backup.js'
import { createId } from './utils/ids.js'

const emptyInsights = computeInsights([], [])
const THEME_STORAGE_KEY = 'bianco-theme'
const LANGUAGE_STORAGE_KEY = 'bianco-language'
const themePreferences = new Set(['auto', 'light', 'dark'])
const languagePreferences = new Set(['auto', 'en', 'it', 'de', 'es', 'fr'])
const categoryTranslationKeys = {
  food_grocery: 'foodGrocery',
  restaurant: 'restaurant',
  transport: 'transport',
  home: 'home',
  health: 'health',
  personal: 'personal',
  entertainment: 'entertainment',
  other: 'other'
}
const providerTranslationKeys = {
  openai: 'openai',
  ollama: 'ollama',
  'openai-compatible': 'openaiCompatible'
}
const statusTranslationKeys = { needs_review: 'needsReview' }
let database = null
let chartConstructorPromise = null

function normalizedThemePreference(value) {
  return themePreferences.has(value) ? value : 'auto'
}

function normalizedLanguagePreference(value) {
  return languagePreferences.has(value) ? value : 'auto'
}

function supportsLocalArchive() {
  return globalThis.isSecureContext &&
    typeof globalThis.crypto?.subtle?.digest === 'function' &&
    typeof globalThis.crypto?.randomUUID === 'function'
}

function getChartConstructor() {
  chartConstructorPromise ||= import('chart.js/auto').then((module) => module.default)
  return chartConstructorPromise
}

function toMinor(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) : null
}

function toEuro(value) {
  return value == null ? '' : (value / 100).toFixed(2)
}

async function datasetHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function biancoApp() {
  return {
    loading: true,
    busy: false,
    view: 'dashboard',
    settingsOpen: false,
    settingsTrigger: null,
    online: navigator.onLine,
    syncStatus: 'disabled',
    receipts: [],
    items: [],
    jobs: [],
    insights: emptyInsights,
    categories,
    providers: [],
    providerModels: [],
    providerBusy: false,
    providerRequestId: 0,
    providerConnectionState: 'idle',
    providerConnectionMessageKey: '',
    providerConnectionMessageOptions: {},
    providerForm: {
      id: '',
      baseUrl: '',
      model: '',
      apiKey: '',
      clearApiKey: false
    },
    chart: null,
    chartRenderRevision: 0,
    languageRevision: 0,
    resolvedLanguage: resolveLanguage(),
    languagePreference: 'auto',
    themePreference: 'auto',
    themeMediaQuery: null,
    settings: {
      selectedAiProvider: null,
      locale: localeForLanguage(resolveLanguage()),
      languagePreference: 'auto',
      themePreference: 'auto',
      defaultCurrency: 'EUR',
      insightMinimumPercent: 20,
      insightMinimumMinor: 1000,
      aiSummary: null
    },
    settingsForm: {
      insightMinimumPercent: 20,
      insightMinimumEuro: 10
    },
    filters: { search: '', category: '', period: 'all' },
    capture: { file: null, previewUrl: null, processing: false },
    detail: { open: false, id: null, form: {}, items: [], imageUrl: null, fullLoaded: false, dirty: false },
    detailRefreshTimer: null,
    toast: { message: '', type: 'success' },
    toastTimer: null,
    includeImagesInBackup: false,
    storageUsage: '—',
    installPrompt: null,
    updateAvailable: false,

    async init() {
      this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      this.themeMediaQuery.addEventListener('change', () => {
        if (this.themePreference === 'auto') this.updateThemeColor()
      })
      if (!supportsLocalArchive()) {
        this.notify(this.t('error.secureContextRequired'), 'error')
        this.loading = false
        return
      }
      try {
        database = await getDatabase()
        const settingsDocument = await database.settings.findOne('singleton').exec()
        await this.setSettings(settingsDocument.toJSON())
        observeReceipts(database, (receipts) => {
          const previousStatuses = new Map(this.receipts.map((receipt) => [receipt.id, receipt.status]))
          this.receipts = receipts
          this.recompute()
          if (receipts.some((receipt) =>
            receipt.status === 'needs_review' && ['queued', 'processing'].includes(previousStatuses.get(receipt.id))
          )) this.notify(this.t('notification.analysisCompleted'))
          this.scheduleDetailRefresh()
        })
        observeItems(database, (items) => {
          this.items = items
          this.recompute()
          this.scheduleDetailRefresh()
        })
        database.jobs.find().$.subscribe((documents) => {
          this.jobs = documents.map((document) => document.toJSON())
        })
        database.settings.findOne('singleton').$.subscribe((document) => {
          if (document) void this.setSettings(document.toJSON())
        })
        await recoverInterruptedJobs(database)
        await startReplication(database, (status) => { this.syncStatus = status })
        await this.refreshProviders(false)
        void this.runJobs()
        void this.updateStorageUsage()
      } catch {
        this.notify(this.t('error.databaseOpen'), 'error')
      } finally {
        this.loading = false
      }
      window.addEventListener('online', () => {
        this.online = true
        void this.refreshProviders(false)
        void this.runJobs()
      })
      window.addEventListener('offline', () => { this.online = false })
      window.addEventListener('bianco-update', () => { this.updateAvailable = true })
      window.addEventListener('bianco-offline-ready', () => this.notify(this.t('notification.offlineReady')))
      window.addEventListener('languagechange', () => {
        if (this.languagePreference === 'auto') void this.updateLanguagePreference('auto')
      })
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault()
        this.installPrompt = event
      })
      window.setInterval(() => void this.runJobs(), 30_000)
    },

    async setSettings(settings) {
      const themePreference = normalizedThemePreference(settings.themePreference)
      const languagePreference = normalizedLanguagePreference(settings.languagePreference)
      this.settings = { ...settings, themePreference, languagePreference }
      this.themePreference = themePreference
      this.languagePreference = languagePreference
      this.applyThemePreference(themePreference)
      await this.applyLanguagePreference(languagePreference, false)
      if (!this.settingsOpen) this.resetSettingsForm()
      this.recompute()
    },

    resetSettingsForm() {
      this.settingsForm = {
        insightMinimumPercent: this.settings.insightMinimumPercent,
        insightMinimumEuro: this.settings.insightMinimumMinor / 100
      }
    },

    applyThemePreference(preference) {
      const normalized = normalizedThemePreference(preference)
      this.themePreference = normalized
      if (normalized === 'auto') document.documentElement.removeAttribute('data-theme')
      else document.documentElement.dataset.theme = normalized
      try { window.localStorage.setItem(THEME_STORAGE_KEY, normalized) } catch { /* Storage may be disabled. */ }
      this.updateThemeColor()
    },

    updateThemeColor() {
      const isDark = this.themePreference === 'dark' || (
        this.themePreference === 'auto' && (this.themeMediaQuery?.matches ?? false)
      )
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#101816' : '#f7faf9')
    },

    async applyLanguagePreference(preference, persistLocale = true) {
      const normalized = normalizedLanguagePreference(preference)
      this.languagePreference = normalized
      try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized) } catch { /* Storage may be disabled. */ }
      const previousLanguage = this.resolvedLanguage
      const { language, locale } = await setLanguage(normalized)
      this.resolvedLanguage = language
      this.settings.locale = locale
      if (previousLanguage !== language) {
        this.languageRevision += 1
        this.chart?.destroy()
        this.chart = null
        this.$nextTick?.(() => this.renderChart())
        void this.updateStorageUsage()
      }
      if (persistLocale && database) {
        const document = await database.settings.findOne('singleton').exec()
        if (document && document.locale !== locale) await document.incrementalPatch({ locale })
      }
      return { language, locale }
    },

    async updateThemePreference(preference) {
      const normalized = normalizedThemePreference(preference)
      this.applyThemePreference(normalized)
      try {
        const document = await database.settings.findOne('singleton').exec()
        await document.incrementalPatch({ themePreference: normalized })
      } catch {
        this.notify(this.t('error.invalidConfiguration'), 'error')
      }
    },

    async updateLanguagePreference(preference) {
      const normalized = normalizedLanguagePreference(preference)
      const oldLanguage = this.resolvedLanguage
      const { locale } = await this.applyLanguagePreference(normalized, false)
      try {
        const document = await database.settings.findOne('singleton').exec()
        await document.incrementalPatch({
          languagePreference: normalized,
          locale,
          aiSummary: oldLanguage === this.resolvedLanguage ? this.settings.aiSummary : null
        })
      } catch {
        this.notify(this.t('error.invalidConfiguration'), 'error')
      }
    },

    openSettings(event) {
      const dialog = this.$refs.settingsDialog
      if (!dialog || dialog.open) return
      this.settingsTrigger = event?.currentTarget || document.activeElement
      this.resetSettingsForm()
      this.settingsOpen = true
      document.documentElement.classList.add('modal-is-open')
      dialog.showModal()
      this.$nextTick?.(() => this.$refs.settingsTitle?.focus())
    },

    closeSettings() {
      if (this.$refs.settingsDialog?.open) this.$refs.settingsDialog.close()
      else this.onSettingsClosed()
    },

    onSettingsClosed() {
      if (!this.settingsOpen && !document.documentElement.classList.contains('modal-is-open')) return
      this.settingsOpen = false
      document.documentElement.classList.remove('modal-is-open')
      this.providerRequestId += 1
      this.providerBusy = false
      this.providerForm.apiKey = ''
      this.providerForm.clearApiKey = false
      const trigger = this.settingsTrigger
      this.settingsTrigger = null
      this.$nextTick?.(() => trigger?.focus())
    },

    recompute() {
      this.insights = computeInsights(this.receipts, this.items, {
        minimumMinor: this.settings.insightMinimumMinor,
        minimumPercent: this.settings.insightMinimumPercent
      })
      this.$nextTick?.(() => this.renderChart())
    },

    async renderChart() {
      const revision = ++this.chartRenderRevision
      const canvas = this.$refs?.categoryChart
      if (!canvas || this.view !== 'dashboard') return
      const entries = this.insights.categories.filter((entry) => entry.total > 0)
      if (!entries.length) {
        this.chart?.destroy()
        this.chart = null
        return
      }
      const Chart = await getChartConstructor()
      if (revision !== this.chartRenderRevision || this.view !== 'dashboard' || canvas !== this.$refs?.categoryChart) return
      this.chart?.destroy()
      this.chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: entries.map((entry) => this.categoryLabel(entry.id)),
          datasets: [{
            data: entries.map((entry) => entry.total / 100),
            backgroundColor: entries.map((entry) => categoryMap[entry.id]?.color || '#64748b'),
            borderWidth: 0,
            spacing: 2
          }]
        },
        options: {
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => this.money(context.raw * 100) } } }
        }
      })
    },

    get syncLabel() {
      const labels = { syncing: 'syncing', idle: 'online', error: 'paused', disabled: 'localOnly' }
      return this.t(`connection.${labels[this.syncStatus] || 'localOnly'}`)
    },

    get pendingCount() {
      const receiptIds = new Set(this.receipts
        .filter((receipt) => receipt.status === 'queued' || receipt.status === 'processing')
        .map((receipt) => receipt.id))
      this.jobs
        .filter((job) => job.status === 'pending' || job.status === 'processing')
        .forEach((job) => receiptIds.add(job.receiptId || job.id))
      return receiptIds.size
    },

    get editingProvider() {
      return this.providers.find((provider) => provider.id === this.providerForm.id) || null
    },

    get activeProvider() {
      return this.providers.find((provider) => provider.id === this.settings.selectedAiProvider) || null
    },

    get providerConnectionMessage() {
      return this.providerConnectionMessageKey
        ? this.t(this.providerConnectionMessageKey, this.providerConnectionMessageOptions)
        : ''
    },

    get filteredReceipts() {
      const query = this.filters.search.trim().toLocaleLowerCase(this.resolvedLanguage)
      const matchingReceiptIds = new Set(this.items.filter((item) =>
        `${item.normalizedName} ${item.rawName}`.toLocaleLowerCase(this.resolvedLanguage).includes(query)
      ).map((item) => item.receiptId))
      const now = new Date()
      return this.receipts.filter((receipt) => {
        if (this.filters.category && receipt.categoryId !== this.filters.category) return false
        if (query) {
          const merchant = `${receipt.merchantNormalized || ''} ${receipt.merchantRaw || ''}`.toLocaleLowerCase(this.resolvedLanguage)
          if (!merchant.includes(query) && !matchingReceiptIds.has(receipt.id)) return false
        }
        if (this.filters.period !== 'all' && receipt.transactionDate) {
          const date = new Date(`${receipt.transactionDate}T12:00:00`)
          if (this.filters.period === 'month' && (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear())) return false
          const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          if (this.filters.period === 'previous' && (date.getMonth() !== previous.getMonth() || date.getFullYear() !== previous.getFullYear())) return false
          if (this.filters.period === 'year' && date.getFullYear() !== now.getFullYear()) return false
        }
        return true
      })
    },

    previewFile(event) {
      const [file] = event.target.files || []
      if (!file) return
      if (!file.type.startsWith('image/')) {
        this.notify(this.t('error.invalidImage'), 'error')
        return
      }
      this.resetCapture()
      this.capture.file = file
      this.capture.previewUrl = URL.createObjectURL(file)
      event.target.value = ''
    },

    resetCapture() {
      if (this.capture.previewUrl) URL.revokeObjectURL(this.capture.previewUrl)
      this.capture = { file: null, previewUrl: null, processing: false }
    },

    async saveCapture() {
      if (!this.capture.file || this.capture.processing) return
      this.capture.processing = true
      try {
        const processed = await processReceiptImage(this.capture.file)
        await createCapturedReceipt(database, processed, this.settings.defaultCurrency)
        this.resetCapture()
        this.notify(this.t('notification.receiptSaved'))
        this.view = 'archive'
        void this.runJobs()
      } catch {
        this.capture.processing = false
        this.notify(this.t('error.saveFailed'), 'error')
      }
    },

    async newManual() {
      const receiptId = await createManualReceipt(database, this.settings.defaultCurrency)
      this.view = 'archive'
      await this.openReceipt(receiptId)
    },

    async openReceipt(receiptId) {
      const result = await getReceiptDetail(database, receiptId)
      if (!result) return
      if (this.detail.imageUrl) URL.revokeObjectURL(this.detail.imageUrl)
      const receipt = result.receipt
      this.detail = {
        open: true,
        id: receiptId,
        form: {
          ...receipt,
          merchantNormalized: receipt.merchantNormalized || '',
          transactionDate: receipt.transactionDate || '',
          totalEuro: toEuro(receipt.totalMinor)
        },
        items: result.items.map((item) => ({
          ...item,
          quantity: item.quantity ?? '',
          unitPriceEuro: toEuro(item.unitPriceMinor),
          totalPriceEuro: toEuro(item.totalPriceMinor)
        })),
        imageUrl: await getImageUrl(database, receipt.imageHash, 'thumbnail'),
        fullLoaded: false,
        dirty: false
      }
      if (!this.detail.imageUrl && receipt.imageHash && this.online) {
        try {
          const blob = await downloadRemoteImage(database, receipt, 'thumbnail')
          this.detail.imageUrl = URL.createObjectURL(blob)
        } catch {
          // Remote image availability is optional while offline or before upload.
        }
      }
    },

    closeDetail() {
      if (this.detailRefreshTimer) window.clearTimeout(this.detailRefreshTimer)
      this.detailRefreshTimer = null
      if (this.detail.imageUrl) URL.revokeObjectURL(this.detail.imageUrl)
      this.detail.open = false
      this.detail.imageUrl = null
    },

    scheduleDetailRefresh() {
      if (!this.detail.open || this.detail.dirty) return
      if (this.detailRefreshTimer) window.clearTimeout(this.detailRefreshTimer)
      const receiptId = this.detail.id
      this.detailRefreshTimer = window.setTimeout(() => {
        this.detailRefreshTimer = null
        if (this.detail.open && this.detail.id === receiptId && !this.detail.dirty) {
          void this.openReceipt(receiptId)
        }
      }, 80)
    },

    async loadFullImage() {
      if (this.detail.fullLoaded) return
      const receipt = this.detail.form
      let url = await getImageUrl(database, receipt.imageHash, 'full')
      if (!url && receipt.imageHash && this.online) {
        try {
          const blob = await downloadRemoteImage(database, receipt, 'full')
          url = URL.createObjectURL(blob)
        } catch {
          this.notify(this.t('error.imageUnavailable'), 'error')
        }
      }
      if (url) {
        if (this.detail.imageUrl) URL.revokeObjectURL(this.detail.imageUrl)
        this.detail.imageUrl = url
        this.detail.fullLoaded = true
      }
    },

    addItem() {
      this.detail.items.push({
        id: createId(), rawName: '', normalizedName: '', quantity: '', unitPriceEuro: '',
        totalPriceEuro: '', categoryId: this.detail.form.categoryId || 'other', confidence: null,
        userEdited: true
      })
      this.detail.dirty = true
    },

    removeItem(index) {
      this.detail.items.splice(index, 1)
      this.detail.dirty = true
    },

    async saveDetail() {
      this.busy = true
      try {
        const form = this.detail.form
        await updateReceipt(database, this.detail.id, {
          merchantRaw: form.merchantNormalized || null,
          merchantNormalized: form.merchantNormalized || null,
          transactionDate: form.transactionDate || null,
          totalMinor: toMinor(form.totalEuro),
          currency: (form.currency || 'EUR').toUpperCase(),
          categoryId: form.categoryId || 'other'
        }, true)
        await replaceReceiptItems(database, this.detail.id, this.detail.items.map((item) => ({
          ...item,
          quantity: item.quantity === '' ? null : Number(item.quantity),
          unitPriceMinor: toMinor(item.unitPriceEuro),
          totalPriceMinor: toMinor(item.totalPriceEuro)
        })), true)
        this.closeDetail()
        this.view = 'archive'
        this.notify(this.t('notification.changesSaved'))
      } catch {
        this.notify(this.t('error.saveFailed'), 'error')
      } finally {
        this.busy = false
      }
    },

    async removeCurrentReceipt() {
      if (!window.confirm(this.t('confirm.deleteReceipt'))) return
      await deleteReceipt(database, this.detail.id)
      this.closeDetail()
      this.notify(this.t('notification.receiptDeleted'))
    },

    async retryAi() {
      try {
        await apiFetch(`/api/ai/jobs/${encodeURIComponent(this.detail.id)}/retry`, { method: 'POST' })
        resyncNow()
        this.notify(this.t('notification.processingQueued'))
      } catch {
        this.notify(this.t('error.backendUnavailable'), 'error')
      }
    },

    async runJobs() {
      if (!database) return
      await runPendingJobs(database, this.settings)
    },

    async saveSettings() {
      this.busy = true
      try {
        const document = await database.settings.findOne('singleton').exec()
        const updated = await document.incrementalPatch({
          insightMinimumPercent: Number(this.settingsForm.insightMinimumPercent) || 0,
          insightMinimumMinor: Math.round((Number(this.settingsForm.insightMinimumEuro) || 0) * 100)
        })
        this.setSettings(updated.toJSON())
        this.notify(this.t('notification.thresholdsUpdated'))
      } catch {
        this.notify(this.t('error.invalidConfiguration'), 'error')
      } finally {
        this.busy = false
      }
    },

    async persistAiProviderSelection(providerId) {
      const document = await database.settings.findOne('singleton').exec()
      if (!document || document.selectedAiProvider === providerId) return
      const updated = await document.incrementalPatch({ selectedAiProvider: providerId })
      await this.setSettings(updated.toJSON())
    },

    async activateAiProvider(providerId) {
      const response = await apiFetch(`/api/ai/providers/${encodeURIComponent(providerId)}/active`, {
        method: 'PUT'
      })
      const activated = await response.json()
      this.providers = this.providers.map((provider) => ({
        ...provider,
        active: provider.id === providerId
      }))
      this.updateProvider(activated)
      await this.persistAiProviderSelection(providerId)
    },

    async refreshProviders(showErrors = true) {
      if (!this.online) return
      try {
        const response = await apiFetch('/api/ai/providers')
        this.providers = (await response.json()).providers
        const activeProvider = this.providers.find((provider) => provider.active && provider.configured)
        if (activeProvider) {
          await this.persistAiProviderSelection(activeProvider.id)
        } else {
          const availableProviders = this.providers.filter((provider) => provider.configured && provider.available)
          const preferred = availableProviders.find((provider) => provider.id === this.settings.selectedAiProvider)
          if (preferred || availableProviders.length === 1) {
            await this.activateAiProvider((preferred || availableProviders[0]).id)
          }
        }
        if (!this.providerForm.id || !this.providers.some((provider) => provider.id === this.providerForm.id)) {
          const preferred = this.settings.selectedAiProvider || this.providers[0]?.id || ''
          this.editProvider(preferred)
        }
      } catch {
        this.providers = []
        if (showErrors) this.notify(this.t('error.backendUnavailable'), 'error')
      }
    },

    editProvider(providerId) {
      this.providerRequestId += 1
      this.providerBusy = false
      const provider = this.providers.find((entry) => entry.id === providerId)
      this.providerModels = []
      this.providerConnectionState = 'idle'
      this.setProviderConnectionMessage(!provider?.baseUrl
        ? 'provider.enterEndpoint'
        : provider.requiresApiKey && !provider.hasApiKey
          ? 'provider.enterApiKey'
          : 'provider.checking')
      this.providerForm = {
        id: provider?.id || '',
        baseUrl: provider?.baseUrl || '',
        model: provider?.model || '',
        apiKey: '',
        clearApiKey: false
      }
      if (this.online && provider?.baseUrl && (!provider.requiresApiKey || provider.hasApiKey)) {
        void this.validateProviderConnection()
      }
    },

    setProviderConnectionMessage(key = '', options = {}) {
      this.providerConnectionMessageKey = key
      this.providerConnectionMessageOptions = options
    },

    providerPayload() {
      const payload = {
        baseUrl: this.providerForm.baseUrl.trim(),
        model: this.providerForm.model.trim(),
        clearApiKey: Boolean(this.providerForm.clearApiKey)
      }
      if (this.providerForm.apiKey.trim()) payload.apiKey = this.providerForm.apiKey.trim()
      return payload
    },

    updateProvider(provider) {
      if (provider.active) {
        this.providers = this.providers.map((entry) => ({ ...entry, active: entry.id === provider.id }))
      }
      const index = this.providers.findIndex((entry) => entry.id === provider.id)
      if (index === -1) this.providers = [...this.providers, provider]
      else this.providers = this.providers.map((entry) => entry.id === provider.id ? provider : entry)
    },

    async validateProviderConnection() {
      if (!this.online || !this.providerForm.id) return
      const providerId = this.providerForm.id
      const requestId = ++this.providerRequestId
      const baseUrl = this.providerForm.baseUrl.trim()
      this.providerModels = []
      if (!baseUrl) {
        this.providerConnectionState = 'idle'
        this.setProviderConnectionMessage('provider.enterEndpoint')
        return
      }
      this.providerBusy = true
      this.providerConnectionState = 'checking'
      this.setProviderConnectionMessage('provider.checkingModels')
      try {
        const saveResponse = await apiFetch(`/api/ai/providers/${encodeURIComponent(providerId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.providerPayload())
        })
        const savedProvider = await saveResponse.json()
        if (requestId !== this.providerRequestId || providerId !== this.providerForm.id) return
        this.updateProvider(savedProvider)
        this.providerForm.apiKey = ''
        this.providerForm.clearApiKey = false
        if (savedProvider.requiresApiKey && !savedProvider.hasApiKey) {
          this.providerConnectionState = 'idle'
          this.setProviderConnectionMessage('provider.enterApiKey')
          return
        }
        const response = await apiFetch(`/api/ai/providers/${encodeURIComponent(providerId)}/models`)
        const models = (await response.json()).models
        if (requestId !== this.providerRequestId || providerId !== this.providerForm.id) return
        const selectedModel = models.includes(this.providerForm.model) ? this.providerForm.model : ''
        this.providerModels = models
        this.providerForm.model = ''
        this.$nextTick?.(() => { this.providerForm.model = selectedModel })
        this.providerConnectionState = models.length ? 'ready' : 'error'
        if (selectedModel) {
          this.setProviderConnectionMessage('provider.modelsActive', {
            provider: this.providerLabel(savedProvider),
            model: selectedModel,
            count: models.length
          })
        } else if (models.length) {
          this.setProviderConnectionMessage('provider.selectAvailable', { count: models.length })
        } else {
          this.setProviderConnectionMessage('provider.noModels')
        }
      } catch {
        if (requestId !== this.providerRequestId || providerId !== this.providerForm.id) return
        this.providerConnectionState = 'error'
        this.setProviderConnectionMessage('provider.unreachable')
      } finally {
        if (requestId === this.providerRequestId) this.providerBusy = false
      }
    },

    async selectProviderModel(model) {
      if (!this.online || !model || !this.providerForm.id) return
      const providerId = this.providerForm.id
      const requestId = ++this.providerRequestId
      this.providerBusy = true
      this.providerConnectionState = 'checking'
      this.setProviderConnectionMessage('provider.activating')
      try {
        this.providerForm.model = model
        const response = await apiFetch(`/api/ai/providers/${encodeURIComponent(providerId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.providerPayload())
        })
        const savedProvider = await response.json()
        if (requestId !== this.providerRequestId || providerId !== this.providerForm.id) return
        this.updateProvider(savedProvider)
        if (!savedProvider.available) throw new Error('MODEL_UNAVAILABLE')
        await this.activateAiProvider(providerId)
        this.providerConnectionState = 'ready'
        this.setProviderConnectionMessage('provider.modelActive', {
          provider: this.providerLabel(savedProvider),
          model: savedProvider.model
        })
        void this.runJobs()
      } catch {
        if (requestId !== this.providerRequestId || providerId !== this.providerForm.id) return
        this.providerConnectionState = 'error'
        this.setProviderConnectionMessage('provider.activationFailed')
      } finally {
        if (requestId === this.providerRequestId) this.providerBusy = false
      }
    },

    async generateAiSummary() {
      this.busy = true
      try {
        const snapshot = { ...insightSnapshot(this.insights), locale: this.settings.locale }
        const query = this.settings.selectedAiProvider ? `?provider_id=${encodeURIComponent(this.settings.selectedAiProvider)}` : ''
        const response = await apiFetch(`/api/ai/insights${query}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot)
        })
        const generated = generatedInsightsSchema.parse(await response.json())
        const document = await database.settings.findOne('singleton').exec()
        await document.incrementalPatch({ aiSummary: {
          ...generated,
          datasetHash: await datasetHash({ snapshot, language: this.resolvedLanguage }),
          generatedAt: new Date().toISOString()
        } })
        this.notify(this.t('notification.summarySaved'))
      } catch {
        this.notify(this.t('error.summaryUnavailable'), 'error')
      } finally {
        this.busy = false
      }
    },

    async exportBackup() {
      this.busy = true
      try {
        await downloadBackup(database, this.includeImagesInBackup)
        this.notify(this.t('notification.backupCreated'))
      } catch {
        this.notify(this.t('error.backupFailed'), 'error')
      } finally {
        this.busy = false
      }
    },

    async wipeLocalData() {
      if (!window.confirm(this.t('confirm.deleteAllData'))) return
      try {
        window.localStorage.removeItem(THEME_STORAGE_KEY)
        window.localStorage.removeItem(LANGUAGE_STORAGE_KEY)
      } catch { /* Storage may be disabled. */ }
      await deleteLocalDatabase()
      window.location.reload()
    },

    async updateStorageUsage() {
      if (!navigator.storage?.estimate) return
      const { usage = 0, quota = 0 } = await navigator.storage.estimate()
      this.storageUsage = this.t('storage.usage', {
        used: (usage / 1024 / 1024).toFixed(1),
        quota: (quota / 1024 / 1024).toFixed(0)
      })
    },

    async installApp() {
      if (!this.installPrompt) return
      await this.installPrompt.prompt()
      this.installPrompt = null
    },

    applyUpdate() {
      window.biancoApplyUpdate?.()
    },

    notify(message, type = 'success') {
      window.clearTimeout(this.toastTimer)
      this.toast = { message, type }
      this.toastTimer = window.setTimeout(() => { this.toast.message = '' }, 4500)
    },

    t(key, options = {}) {
      void this.languageRevision
      return i18next.t(key, options)
    },

    money(value, currency = 'EUR') {
      return new Intl.NumberFormat(this.settings.locale || 'en-GB', { style: 'currency', currency }).format((value || 0) / 100)
    },
    signedMoney(value) { return `${value > 0 ? '+' : ''}${this.money(value)}` },
    signedPercent(value) { return value == null ? '—' : `${value > 0 ? '+' : ''}${this.number(value)}%` },
    number(value) { return new Intl.NumberFormat(this.settings.locale || 'en-GB', { maximumFractionDigits: 1 }).format(value || 0) },
    date(value) {
      return value
        ? new Intl.DateTimeFormat(this.settings.locale || 'en-GB', {
          day: '2-digit', month: 'short', year: 'numeric'
        }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value))
        : this.t('date.unknown')
    },
    categoryLabel(id) { return this.t(`category.${categoryTranslationKeys[id] || 'other'}`) },
    categoryColor(id) { return categoryMap[id]?.color || '#64748b' },
    merchantLabel(id) { return id === UNKNOWN_MERCHANT_ID ? this.t('archive.unknownMerchant') : id },
    providerLabel(provider) {
      const id = typeof provider === 'string' ? provider : provider?.id
      const fallback = typeof provider === 'string' ? provider : provider?.label
      const key = providerTranslationKeys[id]
      return key ? this.t(`provider.name.${key}`) : (fallback || id || '')
    },
    statusLabel(status) { return this.t(`receiptStatus.${statusTranslationKeys[status] || status}`, { defaultValue: status }) },
    insightText(entry) {
      if (entry.type === 'category') {
        return this.t(`insight.category${entry.difference > 0 ? 'Increased' : 'Decreased'}`, {
          category: this.categoryLabel(entry.id),
          percent: this.number(Math.abs(entry.changePercent))
        })
      }
      if (entry.type === 'merchant') {
        return this.t(`insight.merchant${entry.difference > 0 ? 'More' : 'Less'}`, {
          amount: this.money(Math.abs(entry.difference)),
          merchant: this.merchantLabel(entry.id)
        })
      }
      if (entry.type === 'frequency') {
        return this.t('insight.frequency', { product: entry.id, count: entry.frequency })
      }
      return this.t(`insight.price${entry.difference > 0 ? 'Increased' : 'Decreased'}`, {
        product: entry.id,
        percent: this.number(Math.abs(entry.changePercent))
      })
    }
  }
}
