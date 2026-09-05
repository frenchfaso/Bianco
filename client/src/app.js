import { generatedInsightsSchema } from './ai/schemas.js'
import { downloadRemoteImage, recoverInterruptedJobs, runPendingJobs } from './ai/jobs.js'
import { getDatabase, deleteLocalDatabase } from './db/index.js'
import { detectReceiptDocument, processReceiptImage, sanitizeDocumentQuad } from './images/process.js'
import { fitCropMagnifierSize, placeCropMagnifier } from './images/crop-magnifier.js'
import { getImageUrl } from './images/repository.js'
import { i18next, localeForLanguage, resolveLanguage, setLanguage } from './i18n/index.js'
import { computeInsights, insightSnapshot, UNKNOWN_MERCHANT_ID } from './insights/compute.js'
import {
  activeInsightConfigurationFingerprint,
  isSummaryCurrent,
  normalizeInsightConfigurationFingerprint,
  sameSummaryIdentity,
  summaryDatasetHash
} from './insights/summary-cache.js'
import { categories, categoryMap } from './stores/categories.js'
import {
  applyReceiptAggregate,
  createCapturedReceipt,
  createManualReceipt,
  deleteReceipt,
  getReceiptDetail,
  observeReceiptData
} from './stores/receipts.js'
import { queueReceiptEdit } from './stores/receipt-edits.js'
import { flushReceiptEdits, withReceiptEditLock } from './sync/receipt-edit-queue.js'
import { apiFetch } from './sync/api.js'
import {
  getReceiptAggregate,
  isReceiptAggregateConflict,
  receiptAggregateEditableSnapshot,
  receiptAggregateMatches
} from './sync/receipt-aggregates.js'
import { resyncNow, startReplication } from './sync/replication.js'
import { downloadBackup } from './utils/backup.js'
import { createId } from './utils/ids.js'

const emptyInsights = computeInsights([], [])
const THEME_STORAGE_KEY = 'bianco-theme'
const LANGUAGE_STORAGE_KEY = 'bianco-language'
const INSTALL_DISMISSED_STORAGE_KEY = 'bianco-install-dismissed-at'
const INSTALL_DISMISSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SUMMARY_PROMPT_VERSION = 'insights-v3-authority-major-units'
const INSIGHT_MINIMUM_PERCENT = 20
const INSIGHT_MINIMUM_MINOR = 1000
const MAX_CAPTURE_BYTES = 10 * 1024 * 1024
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

function pointerIdentity(event) {
  return event?.pointerId ?? 'mouse'
}

function dominantItemCategory(items) {
  const totals = new Map()
  for (const item of items) {
    const categoryId = categoryMap[item.categoryId] ? item.categoryId : 'other'
    const weight = Math.max(1, Number(item.totalPriceMinor) || toMinor(item.totalPriceEuro) || 0)
    totals.set(categoryId, (totals.get(categoryId) || 0) + weight)
  }
  return [...totals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || 'other'
}

export function biancoApp() {
  return {
    loading: true,
    busy: false,
    view: 'dashboard',
    settingsOpen: false,
    settingsTrigger: null,
    online: navigator.onLine,
    replicationStatus: 'disabled',
    receiptEdits: [],
    receiptsReady: false,
    itemsReady: false,
    summaryValidationRevision: 0,
    aiSummaryCurrent: false,
    // `undefined` means that no backend status has been observed yet. This
    // preserves a valid cached summary while offline; a successful refresh
    // replaces it with either a digest or `null` (no active provider).
    insightConfigurationFingerprint: undefined,
    receipts: [],
    items: [],
    jobs: [],
    insights: emptyInsights,
    categories,
    providers: [],
    providerBusy: false,
    providerRequestId: 0,
    providersRefreshRequestId: 0,
    providerConnectionState: 'idle',
    providerConnectionMessageKey: '',
    providerConnectionMessageOptions: {},
    openAiLogin: null,
    openAiLoginPollTimer: null,
    providerForm: {
      id: '',
      baseUrl: '',
      apiKey: '',
      clearApiKey: false
    },
    categoryChart: null,
    spendingChart: null,
    chartRenderRevision: 0,
    spendingGranularity: 'month',
    languageRevision: 0,
    resolvedLanguage: resolveLanguage(),
    languagePreference: 'auto',
    themePreference: 'auto',
    themeMediaQuery: null,
    settings: {
      locale: localeForLanguage(resolveLanguage()),
      languagePreference: 'auto',
      themePreference: 'auto',
      defaultCurrency: 'EUR',
      aiSummary: null
    },
    filters: { search: '', category: '', period: 'all' },
    capture: {
      file: null,
      processed: null,
      originalUrl: null,
      width: 0,
      height: 0,
      quad: null,
      detected: false,
      confidence: 0,
      draggingCorner: null,
      processing: false,
      saving: false
    },
    captureRequestId: 0,
    captureAbortController: null,
    cropLens: {
      active: false,
      pointerId: null,
      left: 0,
      top: 0,
      size: 156,
      backgroundPosition: 'center',
      backgroundSize: 'auto'
    },
    detail: {
      open: false,
      id: null,
      form: {},
      items: [],
      imageUrl: null,
      fullImageUrl: null,
      fullLoading: false,
      lens: {
        active: false,
        pointerId: null,
        left: 0,
        top: 0,
        backgroundPosition: 'center',
        backgroundSize: 'auto'
      },
      baseRevision: null,
      baseAggregateSnapshot: null,
      displayedSnapshot: null,
      editId: null,
      editStatus: null,
      dirty: false
    },
    detailRefreshTimer: null,
    detailRefreshPending: false,
    imageViewerOpen: false,
    imageViewerReturnFocus: null,
    toast: { message: '', type: 'success' },
    toastTimer: null,
    storageUsage: '—',
    installPrompt: null,
    installSuggestionVisible: false,
    confirmation: { title: '', message: '', confirmLabel: '', destructive: false },
    confirmationResolver: null,
    confirmationReturnFocus: null,
    updateAvailable: Boolean(window.biancoUpdateAvailable),

    async init() {
      this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      this.themeMediaQuery.addEventListener('change', () => {
        if (this.themePreference === 'auto') this.updateThemeColor()
      })
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault()
        this.installPrompt = event
        this.installSuggestionVisible = this.shouldSuggestInstall()
      })
      window.addEventListener('appinstalled', () => {
        this.installPrompt = null
        this.installSuggestionVisible = false
        try { window.localStorage.removeItem(INSTALL_DISMISSED_STORAGE_KEY) } catch { /* Storage may be disabled. */ }
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
        observeReceiptData(database, ({ receipts, items, edits }) => {
          const previousStatuses = new Map(this.receipts.map((receipt) => [receipt.id, receipt.status]))
          this.receipts = receipts
          this.items = items
          this.receiptEdits = edits
          this.receiptsReady = true
          this.itemsReady = true
          this.recompute()
          if (receipts.some((receipt) =>
            receipt.status === 'needs_review' && ['queued', 'processing'].includes(previousStatuses.get(receipt.id))
          )) this.notify(this.t('notification.analysisCompleted'))
          this.scheduleDetailRefresh()
        })
        database.jobs.find().$.subscribe((documents) => {
          this.jobs = documents.map((document) => document.toJSON())
        })
        database.settings.findOne('singleton').$.subscribe((document) => {
          if (document) void this.setSettings(document.toJSON())
        })
        await recoverInterruptedJobs(database)
        await startReplication(
          database,
          (status) => { this.replicationStatus = status },
          (event) => {
            if (['REMOTE_CONNECTED', 'AI_CONFIGURATION_CHANGED'].includes(event)) {
              void this.refreshProviders(false, true)
            }
            if (['REMOTE_CONNECTED', 'RESYNC'].includes(event)) void this.syncReceiptEdits()
          }
        )
        await this.refreshProviders(false, true)
        void this.runJobs()
        void this.updateStorageUsage()
      } catch {
        this.notify(this.t('error.databaseOpen'), 'error')
      } finally {
        this.loading = false
        this.scheduleChartRender()
      }
      window.addEventListener('online', () => {
        this.online = true
        resyncNow()
        void this.syncReceiptEdits()
        void this.refreshProviders(false, true)
        void this.runJobs()
      })
      window.addEventListener('offline', () => { this.online = false })
      const refreshVisibleClient = () => {
        if (document.visibilityState !== 'visible') return
        this.online = navigator.onLine
        if (!this.online) return
        resyncNow()
        void this.syncReceiptEdits()
        void this.refreshProviders(false, true)
      }
      document.addEventListener('visibilitychange', refreshVisibleClient)
      window.addEventListener('pageshow', refreshVisibleClient)
      window.addEventListener('resize', () => this.scheduleChartRender())
      window.addEventListener('bianco-update', () => { this.updateAvailable = true })
      window.addEventListener('bianco-offline-ready', () => this.notify(this.t('notification.offlineReady')))
      window.addEventListener('languagechange', () => {
        if (this.languagePreference === 'auto') void this.updateLanguagePreference('auto')
      })
      window.setInterval(() => void this.runJobs(), 30_000)
      window.setInterval(() => void this.syncReceiptEdits(), 5000)
    },

    async setSettings(settings) {
      const themePreference = normalizedThemePreference(settings.themePreference)
      const languagePreference = normalizedLanguagePreference(settings.languagePreference)
      const aiSummary = settings.aiSummary?.promptVersion === SUMMARY_PROMPT_VERSION
        ? settings.aiSummary
        : null
      this.settings = { ...settings, aiSummary, themePreference, languagePreference }
      this.themePreference = themePreference
      this.languagePreference = languagePreference
      this.applyThemePreference(themePreference)
      await this.applyLanguagePreference(languagePreference, false)
      this.recompute()
    },

    applyThemePreference(preference) {
      const normalized = normalizedThemePreference(preference)
      this.themePreference = normalized
      if (normalized === 'auto') document.documentElement.removeAttribute('data-theme')
      else document.documentElement.dataset.theme = normalized
      try { window.localStorage.setItem(THEME_STORAGE_KEY, normalized) } catch { /* Storage may be disabled. */ }
      this.updateThemeColor()
      this.scheduleChartRender()
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
        this.scheduleChartRender()
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
      this.settingsOpen = true
      document.documentElement.classList.add('modal-is-open')
      dialog.showModal()
      void this.refreshProviders(false, true)
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
      this.stopOpenAiLoginPolling()
      this.providerBusy = false
      this.providerForm.apiKey = ''
      this.providerForm.clearApiKey = false
      const trigger = this.settingsTrigger
      this.settingsTrigger = null
      this.$nextTick?.(() => trigger?.focus())
    },

    recompute() {
      this.insights = computeInsights(this.receipts, this.items, {
        minimumMinor: INSIGHT_MINIMUM_MINOR,
        minimumPercent: INSIGHT_MINIMUM_PERCENT,
        defaultCurrency: this.settings.defaultCurrency
      })
      this.aiSummaryCurrent = false
      void this.validateAiSummary()
      this.scheduleChartRender()
    },

    summarySnapshot() {
      return {
        ...insightSnapshot(this.insights),
        locale: this.settings.locale,
        currency: this.settings.defaultCurrency
      }
    },

    async validateAiSummary() {
      const summary = this.settings.aiSummary
      if (!summary || !this.receiptsReady || !this.itemsReady) return
      const revision = ++this.summaryValidationRevision
      const expectedHash = await summaryDatasetHash(
        this.summarySnapshot(),
        this.resolvedLanguage,
        SUMMARY_PROMPT_VERSION
      )
      if (revision !== this.summaryValidationRevision || this.settings.aiSummary !== summary) return
      if (isSummaryCurrent(
        summary,
        expectedHash,
        SUMMARY_PROMPT_VERSION,
        this.insightConfigurationFingerprint
      )) {
        this.aiSummaryCurrent = true
        return
      }
      this.settings = { ...this.settings, aiSummary: null }
      const document = await database?.settings.findOne('singleton').exec()
      const storedSummary = document?.aiSummary
      if (sameSummaryIdentity(storedSummary, summary)) {
        await document.incrementalPatch({ aiSummary: null })
      }
    },

    showDashboard() {
      this.view = 'dashboard'
      this.scheduleChartRender()
    },

    setSpendingGranularity(granularity) {
      if (!['week', 'month'].includes(granularity) || granularity === this.spendingGranularity) return
      this.spendingGranularity = granularity
      this.scheduleChartRender()
    },

    scheduleChartRender() {
      if (this.loading || this.view !== 'dashboard') return
      const revision = ++this.chartRenderRevision
      this.$nextTick?.(() => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          if (revision === this.chartRenderRevision) void this.renderCharts(revision)
        }))
      })
    },

    prepareChartCanvas(canvas, container) {
      if (!canvas || !container) return false
      const bounds = container.getBoundingClientRect()
      if (bounds.width < 1 || bounds.height < 1) return false
      canvas.style.width = `${bounds.width}px`
      canvas.style.height = `${bounds.height}px`
      canvas.width = Math.max(1, Math.round(bounds.width))
      canvas.height = Math.max(1, Math.round(bounds.height))
      return true
    },

    chartColors() {
      const styles = window.getComputedStyle(document.documentElement)
      return {
        accent: styles.getPropertyValue('--accent').trim() || '#0f766e',
        line: styles.getPropertyValue('--line').trim() || '#dce6e3',
        muted: styles.getPropertyValue('--muted').trim() || '#63746f'
      }
    },

    spendingPeriodLabel(entry) {
      const date = new Date(`${entry.start}T12:00:00`)
      const options = this.spendingGranularity === 'month'
        ? { month: 'short', year: '2-digit' }
        : { day: 'numeric', month: 'short' }
      return new Intl.DateTimeFormat(this.settings.locale || 'en-GB', options).format(date)
    },

    async renderCharts(revision = this.chartRenderRevision) {
      if (this.loading || this.view !== 'dashboard') return
      const Chart = await getChartConstructor()
      if (revision !== this.chartRenderRevision || this.view !== 'dashboard') return
      const colors = this.chartColors()
      const commonOptions = {
        responsive: false,
        animation: false,
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        plugins: { legend: { display: false } }
      }

      const categoryEntries = this.insights.categories.filter((entry) => entry.total > 0)
      this.categoryChart?.destroy()
      this.categoryChart = null
      if (categoryEntries.length && this.prepareChartCanvas(this.$refs.categoryChart, this.$refs.categoryChartContainer)) {
        this.categoryChart = new Chart(this.$refs.categoryChart, {
          type: 'doughnut',
          data: {
            labels: categoryEntries.map((entry) => this.categoryLabel(entry.id)),
            datasets: [{
              data: categoryEntries.map((entry) => entry.total / 100),
              backgroundColor: categoryEntries.map((entry) => categoryMap[entry.id]?.color || '#64748b'),
              borderWidth: 0,
              spacing: 2
            }]
          },
          options: {
            ...commonOptions,
            cutout: '70%',
            plugins: {
              ...commonOptions.plugins,
              tooltip: { callbacks: { label: (context) => this.money(Math.round(context.raw * 100)) } }
            }
          }
        })
      }

      const series = this.spendingGranularity === 'week'
        ? this.insights.spending.weekly
        : this.insights.spending.monthly
      this.spendingChart?.destroy()
      this.spendingChart = null
      if (series.some((entry) => entry.total > 0) && this.prepareChartCanvas(this.$refs.spendingChart, this.$refs.spendingChartContainer)) {
        this.spendingChart = new Chart(this.$refs.spendingChart, {
          type: 'bar',
          data: {
            labels: series.map((entry) => this.spendingPeriodLabel(entry)),
            datasets: [{
              data: series.map((entry) => entry.total / 100),
              backgroundColor: colors.accent,
              borderColor: colors.accent,
              borderWidth: 0,
              borderRadius: 6,
              minBarLength: 2
            }]
          },
          options: {
            ...commonOptions,
            scales: {
              x: { grid: { display: false }, ticks: { color: colors.muted, maxRotation: 0, autoSkip: true } },
              y: {
                beginAtZero: true,
                grid: { color: colors.line },
                ticks: { color: colors.muted, callback: (value) => this.money(Number(value) * 100) }
              }
            },
            plugins: {
              ...commonOptions.plugins,
              tooltip: { callbacks: { label: (context) => this.money(Math.round(context.raw * 100)) } }
            }
          }
        })
      }
    },

    get syncStatus() {
      if (this.replicationStatus === 'error' || this.receiptEdits.some((edit) => edit.status !== 'pending')) return 'error'
      if (this.receiptEdits.length) return 'syncing'
      return this.replicationStatus
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
      this.receiptEdits.filter((edit) => edit.status === 'pending').forEach((edit) => receiptIds.add(edit.id))
      return receiptIds.size
    },

    get attentionCount() {
      return this.receipts.filter((receipt) => ['needs_review', 'failed'].includes(receipt.status) || this.receiptEditNeedsAttention(receipt.id)).length
    },

    receiptEditNeedsAttention(receiptId) {
      return this.receiptEdits.some((edit) => edit.id === receiptId && edit.status !== 'pending')
    },

    get editingProvider() {
      return this.providers.find((provider) => provider.id === this.providerForm.id) || null
    },

    get activeProvider() {
      return this.providers.find((provider) => provider.active && provider.configured) || null
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
        if (this.filters.category) {
          const receiptItems = this.items.filter((item) => item.receiptId === receipt.id)
          const matchesItem = receiptItems.some((item) => item.categoryId === this.filters.category)
          if (!matchesItem && (receiptItems.length || receipt.categoryId !== this.filters.category)) return false
        }
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

    async previewFile(event) {
      const [file] = event.target.files || []
      if (!file) return
      if (!file.type.startsWith('image/')) {
        this.notify(this.t('error.invalidImage'), 'error')
        event.target.value = ''
        return
      }
      if (file.size > MAX_CAPTURE_BYTES) {
        this.notify(this.t('error.imageTooLarge'), 'error')
        event.target.value = ''
        return
      }
      this.resetCapture()
      const requestId = this.captureRequestId
      this.capture = {
        file,
        processed: null,
        originalUrl: URL.createObjectURL(file),
        width: 0,
        height: 0,
        quad: null,
        detected: false,
        confidence: 0,
        draggingCorner: null,
        processing: true,
        saving: false
      }
      event.target.value = ''
      try {
        const detection = await detectReceiptDocument(file)
        if (requestId !== this.captureRequestId) return
        this.capture.width = detection.width
        this.capture.height = detection.height
        this.capture.quad = detection.quad
        this.capture.detected = detection.detected
        this.capture.confidence = detection.confidence
      } catch {
        if (requestId !== this.captureRequestId) return
        this.resetCapture()
        this.notify(this.t('error.jpegEncodingFailed'), 'error')
      } finally {
        if (requestId === this.captureRequestId) this.capture.processing = false
      }
    },

    resetCapture() {
      this.captureAbortController?.abort()
      this.captureAbortController = null
      this.captureRequestId += 1
      this.hideCropMagnifier()
      if (this.capture.originalUrl) URL.revokeObjectURL(this.capture.originalUrl)
      this.capture = {
        file: null,
        processed: null,
        originalUrl: null,
        width: 0,
        height: 0,
        quad: null,
        detected: false,
        confidence: 0,
        draggingCorner: null,
        processing: false,
        saving: false
      }
    },

    cropPolygonPoints() {
      return (this.capture.quad || []).map((point) => `${point.x},${point.y}`).join(' ')
    },

    cropHandleRadius() {
      const touchRatio = globalThis.matchMedia?.('(max-width: 760px)').matches ? 0.05 : 0.026
      return Math.max(this.capture.width, this.capture.height) * touchRatio
    },

    cropQuadValid() {
      return Boolean(sanitizeDocumentQuad(
        this.capture.quad,
        this.capture.width,
        this.capture.height
      ))
    },

    updateCropCorner(event) {
      const index = this.capture.draggingCorner
      const svg = this.$refs.cropEditor
      if (index == null || !svg) return
      event.preventDefault()
      const matrix = svg.getScreenCTM()
      if (!matrix) return
      const point = svg.createSVGPoint()
      point.x = event.clientX
      point.y = event.clientY
      const mapped = point.matrixTransform(matrix.inverse())
      const quad = this.capture.quad.map((corner) => ({ ...corner }))
      quad[index] = {
        x: Math.max(0, Math.min(this.capture.width, mapped.x)),
        y: Math.max(0, Math.min(this.capture.height, mapped.y))
      }
      this.capture.quad = quad
      this.updateCropMagnifier(event, mapped, matrix)
    },

    startCropCorner(index, event) {
      event.preventDefault()
      this.capture.draggingCorner = index
      this.cropLens.pointerId = pointerIdentity(event)
      event.currentTarget.setPointerCapture?.(event.pointerId)
      this.updateCropCorner(event)
    },

    stopCropCorner(event) {
      if (event && this.cropLens.pointerId !== null && pointerIdentity(event) !== this.cropLens.pointerId) return
      this.capture.draggingCorner = null
      this.hideCropMagnifier()
    },

    hideCropMagnifier() {
      this.cropLens.active = false
      this.cropLens.pointerId = null
    },

    updateCropMagnifier(event, mapped, matrix) {
      const viewport = globalThis.visualViewport
      const viewportWidth = viewport?.width || globalThis.innerWidth || document.documentElement.clientWidth
      const viewportHeight = viewport?.height || globalThis.innerHeight || document.documentElement.clientHeight
      const preferredSize = Math.max(132, Math.min(176, viewportWidth * 0.38))
      const size = fitCropMagnifierSize(viewportWidth, viewportHeight, preferredSize)
      const position = placeCropMagnifier(
        event.clientX,
        event.clientY,
        size,
        viewportWidth,
        viewportHeight
      )
      const zoom = 3
      const scaleX = Math.hypot(matrix.a, matrix.b)
      const scaleY = Math.hypot(matrix.c, matrix.d)
      this.cropLens = {
        ...this.cropLens,
        active: true,
        left: position.left,
        top: position.top,
        size,
        backgroundPosition: `${size / 2 - mapped.x * scaleX * zoom}px ${size / 2 - mapped.y * scaleY * zoom}px`,
        backgroundSize: `${this.capture.width * scaleX * zoom}px ${this.capture.height * scaleY * zoom}px`
      }
    },

    cropMagnifierStyle() {
      return {
        left: `${this.cropLens.left}px`,
        top: `${this.cropLens.top}px`,
        width: `${this.cropLens.size}px`,
        height: `${this.cropLens.size}px`,
        backgroundImage: this.capture.originalUrl ? `url("${this.capture.originalUrl}")` : 'none',
        backgroundPosition: this.cropLens.backgroundPosition,
        backgroundSize: this.cropLens.backgroundSize
      }
    },

    async confirmCapture() {
      if (!this.capture.file || !this.cropQuadValid() || this.capture.processing || this.capture.saving) return
      const requestId = this.captureRequestId
      const controller = new AbortController()
      this.captureAbortController = controller
      this.capture.saving = true
      this.capture.processing = true
      try {
        const processed = await processReceiptImage(this.capture.file, {
          sourceQuad: this.capture.quad,
          signal: controller.signal
        })
        if (requestId !== this.captureRequestId) return
        this.capture.processed = processed
        await createCapturedReceipt(
          database,
          processed,
          this.settings.defaultCurrency
        )
        this.resetCapture()
        this.notify(this.t('notification.receiptSaved'))
        this.view = 'archive'
        void this.runJobs()
      } catch (error) {
        if (error?.name === 'AbortError') return
        this.capture.saving = false
        this.notify(this.t('error.saveFailed'), 'error')
      } finally {
        if (this.captureAbortController === controller) this.captureAbortController = null
        if (requestId === this.captureRequestId) this.capture.processing = false
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
      this.detailRefreshPending = false
      if (this.detail.imageUrl) URL.revokeObjectURL(this.detail.imageUrl)
      if (this.detail.fullImageUrl) URL.revokeObjectURL(this.detail.fullImageUrl)
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
        fullImageUrl: null,
        fullLoading: false,
        lens: {
          active: false,
          pointerId: null,
          left: 0,
          top: 0,
          backgroundPosition: 'center',
          backgroundSize: 'auto'
        },
        baseRevision: result.edit?.baseRevision ?? null,
        baseAggregateSnapshot: result.edit ? JSON.parse(result.edit.baseSnapshot) : receiptAggregateEditableSnapshot(receipt, result.items),
        displayedSnapshot: receiptAggregateEditableSnapshot(receipt, result.items),
        editId: result.edit?.editId || null,
        editStatus: result.edit?.status || null,
        dirty: false
      }
      if (this.online && !result.edit) void this.loadReceiptAggregateRevision(receiptId)
      if (!this.detail.imageUrl && receipt.imageHash && this.online) {
        try {
          const blob = await downloadRemoteImage(database, receipt, 'thumbnail')
          this.detail.imageUrl = URL.createObjectURL(blob)
        } catch {
          // Remote image availability is optional while offline or before upload.
        }
      }
      void this.ensureFullImage(receiptId)
    },

    async loadReceiptAggregateRevision(receiptId) {
      try {
        const aggregate = await getReceiptAggregate(receiptId)
        if (this.detail.open && this.detail.id === receiptId && Number.isInteger(aggregate?.revision)) {
          if (receiptAggregateMatches(this.detail.baseAggregateSnapshot, aggregate)) {
            this.detail.baseRevision = aggregate.revision
            return 'ready'
          }
          this.detail.baseRevision = null
          resyncNow()
          return 'conflict'
        }
      } catch {
        // The local copy remains editable when the backend is unavailable or
        // has not received this offline-first receipt yet.
      }
      return 'unavailable'
    },

    closeDetail() {
      if (this.detailRefreshTimer) window.clearTimeout(this.detailRefreshTimer)
      this.detailRefreshTimer = null
      this.detailRefreshPending = false
      this.imageViewerReturnFocus = null
      if (this.$refs.imageViewerDialog?.open) this.$refs.imageViewerDialog.close()
      this.imageViewerOpen = false
      if (this.detail.imageUrl) URL.revokeObjectURL(this.detail.imageUrl)
      if (this.detail.fullImageUrl) URL.revokeObjectURL(this.detail.fullImageUrl)
      this.detail.open = false
      this.detail.imageUrl = null
      this.detail.fullImageUrl = null
      this.detail.fullLoading = false
      this.detail.lens.active = false
    },

    scheduleDetailRefresh() {
      if (!this.detail.open) return
      this.detailRefreshPending = true
      if (
        this.busy ||
        this.detail.dirty ||
        this.detail.fullLoading ||
        this.imageViewerOpen ||
        this.detail.lens.pointerId !== null
      ) return
      if (this.detailRefreshTimer) window.clearTimeout(this.detailRefreshTimer)
      const receiptId = this.detail.id
      this.detailRefreshTimer = window.setTimeout(() => {
        this.detailRefreshTimer = null
        if (
          this.detail.open &&
          this.detail.id === receiptId &&
          !this.busy &&
          !this.detail.dirty &&
          !this.imageViewerOpen &&
          this.detail.lens.pointerId === null
        ) {
          this.detailRefreshPending = false
          void this.openReceipt(receiptId)
        }
      }, 80)
    },

    async ensureFullImage(receiptId = this.detail.id) {
      if (this.detail.fullLoading) return
      const receipt = this.detail.form
      let url = this.detail.fullImageUrl
      this.detail.fullLoading = !url
      try {
        if (!url) url = await getImageUrl(database, receipt.imageHash, 'full')
        if (!url && receipt.imageHash && this.online) {
          const blob = await downloadRemoteImage(database, receipt, 'full')
          url = URL.createObjectURL(blob)
        }
      } catch {
        url = null
      } finally {
        this.detail.fullLoading = false
      }
      if (!this.detail.open || this.detail.id !== receiptId) {
        if (url && url !== this.detail.fullImageUrl) URL.revokeObjectURL(url)
        return null
      }
      if (!url) {
        return null
      }
      this.detail.fullImageUrl = url
      return url
    },

    async loadFullImage(event) {
      const trigger = event?.currentTarget || document.activeElement
      const url = await this.ensureFullImage()
      if (!url) {
        this.notify(this.t('error.imageUnavailable'), 'error')
        return
      }
      this.openImageViewer(trigger)
    },

    async activateMagnifier(event, capturePointer = false) {
      event.preventDefault()
      const surface = event.currentTarget
      const receiptId = this.detail.id
      const pointerId = pointerIdentity(event)
      const url = await this.ensureFullImage(receiptId)
      if (!url || !this.detail.open || this.detail.id !== receiptId) return
      if (capturePointer && this.detail.lens.pointerId !== pointerId) return
      if ((!event.pointerType || event.pointerType === 'mouse') && !surface.matches(':hover')) return
      this.detail.lens.pointerId = pointerId
      this.updateMagnifier(event, surface)
    },

    beginMagnifier(event) {
      if (event.pointerType === 'mouse') return
      event.preventDefault()
      this.detail.lens.pointerId = pointerIdentity(event)
      try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* Pointer may already be released. */ }
      void this.activateMagnifier(event, true)
    },

    hoverMagnifier(event) {
      if ((event.pointerType && event.pointerType !== 'mouse') || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
      void this.activateMagnifier(event)
    },

    moveMagnifier(event) {
      if (event.pointerType && event.pointerType !== 'mouse') event.preventDefault()
      const mouseInput = !event.pointerType || event.pointerType === 'mouse'
      if (mouseInput && this.detail.lens.pointerId !== pointerIdentity(event)) {
        this.hoverMagnifier(event)
        return
      }
      this.updateMagnifier(event)
    },

    updateMagnifier(event, target = event.currentTarget) {
      if (this.detail.lens.pointerId !== pointerIdentity(event)) return
      const surface = target
      const image = surface.querySelector('img')
      if (!image?.naturalWidth || !image?.naturalHeight) return
      const bounds = surface.getBoundingClientRect()
      const imageRatio = image.naturalWidth / image.naturalHeight
      const boxRatio = bounds.width / bounds.height
      let contentWidth = bounds.width
      let contentHeight = bounds.height
      let offsetX = 0
      let offsetY = 0
      if (imageRatio > boxRatio) {
        contentHeight = contentWidth / imageRatio
        offsetY = (bounds.height - contentHeight) / 2
      } else {
        contentWidth = contentHeight * imageRatio
        offsetX = (bounds.width - contentWidth) / 2
      }
      const sampleX = Math.max(0, Math.min(contentWidth, event.clientX - bounds.left - offsetX))
      const sampleY = Math.max(0, Math.min(contentHeight, event.clientY - bounds.top - offsetY))
      const radius = Math.min(76, Math.max(58, bounds.width * 0.18))
      const pointerX = event.clientX - bounds.left
      const pointerY = event.clientY - bounds.top
      const touchOffset = event.pointerType === 'touch' ? radius + 34 : 0
      const left = Math.max(0, Math.min(bounds.width - radius * 2, pointerX - radius))
      const top = Math.max(0, Math.min(bounds.height - radius * 2, pointerY - radius - touchOffset))
      const zoom = 2.6
      this.detail.lens = {
        active: true,
        pointerId: pointerIdentity(event),
        left,
        top,
        size: radius * 2,
        backgroundPosition: `${radius - sampleX * zoom}px ${radius - sampleY * zoom}px`,
        backgroundSize: `${contentWidth * zoom}px ${contentHeight * zoom}px`
      }
    },

    stopMagnifier(event) {
      if (event && this.detail.lens.pointerId !== pointerIdentity(event)) return
      this.detail.lens.active = false
      this.detail.lens.pointerId = null
      if (this.detailRefreshPending) this.scheduleDetailRefresh()
    },

    releaseMagnifier(event) {
      if (event.pointerType !== 'mouse') this.stopMagnifier(event)
    },

    magnifierStyle() {
      const lens = this.detail.lens
      return {
        left: '0',
        top: '0',
        transform: `translate3d(${lens.left || 0}px, ${lens.top || 0}px, 0)`,
        width: `${lens.size || 140}px`,
        height: `${lens.size || 140}px`,
        backgroundImage: this.detail.fullImageUrl ? `url("${this.detail.fullImageUrl}")` : 'none',
        backgroundPosition: lens.backgroundPosition,
        backgroundSize: lens.backgroundSize
      }
    },

    openImageViewer(trigger) {
      const dialog = this.$refs.imageViewerDialog
      if (!dialog || dialog.open || !this.detail.fullImageUrl) return
      if (this.detailRefreshTimer) window.clearTimeout(this.detailRefreshTimer)
      this.detailRefreshTimer = null
      this.imageViewerReturnFocus = trigger || document.activeElement
      this.imageViewerOpen = true
      dialog.showModal()
      this.$nextTick?.(() => this.$refs.imageViewerClose?.focus())
    },

    closeImageViewer() {
      if (this.$refs.imageViewerDialog?.open) {
        this.$refs.imageViewerDialog.close()
      } else {
        this.onImageViewerClosed()
      }
    },

    onImageViewerClosed() {
      const returnFocus = this.imageViewerReturnFocus
      this.imageViewerReturnFocus = null
      this.imageViewerOpen = false
      this.$nextTick?.(() => returnFocus?.focus?.())
    },

    addItem() {
      this.detail.items.push({
        id: createId(), rawName: '', normalizedName: '', quantity: '', unitPriceEuro: '',
        totalPriceEuro: '', categoryId: 'other', confidence: null,
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
        const items = this.detail.items
          .map((item) => ({
            ...item,
            id: item.id || createId(),
            quantity: item.quantity === '' ? null : Number(item.quantity),
            unitPriceMinor: toMinor(item.unitPriceEuro),
            totalPriceMinor: toMinor(item.totalPriceEuro)
          }))
          .filter((item) => String(item.normalizedName || item.rawName || '').trim())
        const receiptChanges = {
          merchantRaw: form.merchantNormalized || null,
          merchantNormalized: form.merchantNormalized || null,
          transactionDate: form.transactionDate || null,
          totalMinor: toMinor(form.totalEuro),
          currency: (form.currency || 'EUR').toUpperCase(),
          // Retained only for old clients; item categories are authoritative.
          categoryId: dominantItemCategory(items)
        }
        this.detail.editId = await queueReceiptEdit(database, {
          receiptId: this.detail.id,
          editId: this.detail.editId,
          baseRevision: this.detail.baseRevision,
          baseSnapshot: this.detail.baseAggregateSnapshot,
          displayedSnapshot: this.detail.displayedSnapshot,
          receipt: { ...form, ...receiptChanges },
          items
        })
        if (this.online) {
          const results = await this.syncReceiptEdits()
          const status = results?.get(this.detail.id)
          if (status === 'conflict' || status === 'rejected') {
            this.detail.editStatus = status
            this.notify(this.t(status === 'conflict' ? 'error.receiptConflict' : 'error.saveFailed'), 'error')
            return
          }
        }
        this.closeDetail()
        this.view = 'archive'
        this.notify(this.t('notification.changesSaved'))
      } catch (error) {
        this.notify(this.t(isReceiptAggregateConflict(error) ? 'error.receiptConflict' : 'error.saveFailed'), 'error')
      } finally {
        this.busy = false
      }
    },

    async syncReceiptEdits() {
      if (!database || !this.online) return
      try {
        return await flushReceiptEdits(database)
      } catch {
        // The complete edit is durable; retry after a transient local failure.
        this.replicationStatus = 'error'
      }
    },

    async useSyncedReceipt() {
      if (!await this.confirmAction({
        title: this.t('receiptDetail.useSynced'),
        message: this.t('receiptDetail.discardPending'),
        confirmLabel: this.t('receiptDetail.useSynced'),
        destructive: true
      })) return
      try {
        // Require a successful authenticated read before discarding the draft.
        await withReceiptEditLock(database, async () => {
          const aggregate = await getReceiptAggregate(this.detail.id)
          const edit = await database.receipt_edits.findOne(this.detail.id).exec()
          await applyReceiptAggregate(database, aggregate)
          await edit?.incrementalModify((current) => {
            if (current.editId !== this.detail.editId) throw new Error('Draft changed in another tab')
            return { ...current, _deleted: true }
          })
        })
        resyncNow()
        this.detail.dirty = false
        await this.openReceipt(this.detail.id)
      } catch {
        this.notify(this.t('error.backendUnavailable'), 'error')
      }
    },

    async removeCurrentReceipt() {
      const confirmed = await this.confirmAction({
        title: this.t('confirm.deleteReceiptTitle'),
        message: this.t('confirm.deleteReceipt'),
        confirmLabel: this.t('common.delete'),
        destructive: true
      })
      if (!confirmed) return
      await withReceiptEditLock(database, () => deleteReceipt(database, this.detail.id))
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

    async reanalyzeAi() {
      const confirmed = await this.confirmAction({
        title: this.t('confirm.reanalyzeReceiptTitle'),
        message: this.t('confirm.reanalyzeReceipt'),
        confirmLabel: this.t('receiptDetail.reanalyze'),
        destructive: false
      })
      if (!confirmed) return
      try {
        await apiFetch(`/api/ai/jobs/${encodeURIComponent(this.detail.id)}/reanalyze`, { method: 'POST' })
        this.detail.dirty = false
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
    },

    refreshInsightConfigurationFingerprint() {
      const fingerprint = activeInsightConfigurationFingerprint(this.providers)
      if (this.insightConfigurationFingerprint === fingerprint) return
      this.insightConfigurationFingerprint = fingerprint
      this.aiSummaryCurrent = false
      void this.validateAiSummary()
    },

    async refreshProviders(showErrors = true, alignWithActive = false) {
      if (!this.online) return
      const requestId = ++this.providersRefreshRequestId
      try {
        const response = await apiFetch('/api/ai/providers')
        const providers = (await response.json()).providers
        if (requestId !== this.providersRefreshRequestId) return
        this.providers = providers
        const activeProvider = this.providers.find((provider) => provider.active && provider.configured)
        if (!activeProvider) {
          const availableProviders = this.providers.filter((provider) => provider.configured && provider.available)
          if (availableProviders.length === 1) {
            await this.activateAiProvider(availableProviders[0].id)
          }
        }
        this.refreshInsightConfigurationFingerprint()
        const activeSelectionChanged = alignWithActive && activeProvider && !this.providerBusy &&
          this.providerForm.id !== activeProvider.id
        if (activeSelectionChanged) {
          this.editProvider(activeProvider.id)
        } else if (!this.providerForm.id || !this.providers.some((provider) => provider.id === this.providerForm.id)) {
          this.editProvider(activeProvider?.id || this.providers[0]?.id || '')
        }
      } catch {
        if (requestId !== this.providersRefreshRequestId) return
        this.providers = []
        if (showErrors) this.notify(this.t('error.backendUnavailable'), 'error')
      }
    },

    editProvider(providerId) {
      this.providerRequestId += 1
      this.providerBusy = false
      this.stopOpenAiLoginPolling()
      this.openAiLogin = null
      const provider = this.providers.find((entry) => entry.id === providerId)
      this.providerConnectionState = 'idle'
      this.setProviderConnectionMessage(provider?.id === 'openai'
        ? provider.chatgptConnected
          ? provider.active && provider.available
            ? 'provider.providerActive'
            : 'provider.backendUnavailable'
          : 'provider.connectChatgpt'
        : !provider?.baseUrl
          ? 'provider.enterEndpoint'
          : provider.requiresApiKey && !provider.hasApiKey
            ? 'provider.enterApiKey'
            : 'provider.checking', provider?.id === 'openai' && provider.active
              ? { provider: this.providerLabel(provider) }
              : {})
      this.providerForm = {
        id: provider?.id || '',
        baseUrl: provider?.baseUrl || '',
        apiKey: '',
        clearApiKey: false
      }
      if (this.online && provider?.id !== 'openai' && provider?.baseUrl && (!provider.requiresApiKey || provider.hasApiKey)) {
        void this.validateProviderConnection()
      }
    },

    async selectAiProvider(providerId) {
      this.editProvider(providerId)
      const requestId = this.providerRequestId
      const provider = this.providers.find((entry) => entry.id === providerId)
      // Endpoint-based providers are saved, validated and activated by
      // editProvider() -> validateProviderConnection(). OpenAI has no endpoint
      // form, so a connected inactive subscription needs this direct path.
      if (providerId !== 'openai') return
      if (!this.online || !provider?.configured || !provider.available || provider.active) return
      this.providerBusy = true
      this.providerConnectionState = 'checking'
      this.setProviderConnectionMessage('provider.checking')
      try {
        const response = await apiFetch(`/api/ai/providers/${encodeURIComponent(providerId)}/active`, {
          method: 'PUT'
        })
        const activated = await response.json()
        if (requestId !== this.providerRequestId || providerId !== this.providerForm.id) return
        this.updateProvider(activated)
        this.providerConnectionState = 'ready'
        this.setProviderConnectionMessage('provider.providerActive', {
          provider: this.providerLabel(activated)
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

    setProviderConnectionMessage(key = '', options = {}) {
      this.providerConnectionMessageKey = key
      this.providerConnectionMessageOptions = options
    },

    providerPayload() {
      const payload = {
        baseUrl: this.providerForm.baseUrl.trim(),
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
      this.refreshInsightConfigurationFingerprint()
    },

    async validateProviderConnection() {
      if (!this.online || !this.providerForm.id) return
      const providerId = this.providerForm.id
      if (providerId === 'openai') return
      const requestId = ++this.providerRequestId
      const baseUrl = this.providerForm.baseUrl.trim()
      if (!baseUrl) {
        this.providerConnectionState = 'idle'
        this.setProviderConnectionMessage('provider.enterEndpoint')
        return
      }
      this.providerBusy = true
      this.providerConnectionState = 'checking'
      this.setProviderConnectionMessage('provider.checking')
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
        if (!savedProvider.configured || !savedProvider.available) {
          this.providerConnectionState = 'error'
          this.setProviderConnectionMessage('provider.backendUnavailable')
          return
        }
        await this.activateAiProvider(providerId)
        this.providerConnectionState = 'ready'
        this.setProviderConnectionMessage('provider.providerActive', {
          provider: this.providerLabel(savedProvider)
        })
        void this.runJobs()
      } catch {
        if (requestId !== this.providerRequestId || providerId !== this.providerForm.id) return
        this.providerConnectionState = 'error'
        this.setProviderConnectionMessage('provider.unreachable')
      } finally {
        if (requestId === this.providerRequestId) this.providerBusy = false
      }
    },

    stopOpenAiLoginPolling() {
      if (this.openAiLoginPollTimer) window.clearInterval(this.openAiLoginPollTimer)
      this.openAiLoginPollTimer = null
    },

    async connectOpenAiSubscription() {
      if (!this.online || this.providerBusy) return
      this.providerBusy = true
      this.providerConnectionState = 'checking'
      this.setProviderConnectionMessage('provider.startingChatgptLogin')
      try {
        const response = await apiFetch('/api/ai/providers/openai/chatgpt/device', { method: 'POST' })
        this.openAiLogin = { ...(await response.json()), status: 'pending' }
        this.providerConnectionState = 'checking'
        this.setProviderConnectionMessage('provider.waitingChatgptLogin')
        this.stopOpenAiLoginPolling()
        this.openAiLoginPollTimer = window.setInterval(() => void this.pollOpenAiLogin(), 2000)
      } catch {
        this.providerConnectionState = 'error'
        this.setProviderConnectionMessage('provider.chatgptLoginFailed')
      } finally {
        this.providerBusy = false
      }
    },

    openOpenAiVerification() {
      try {
        const url = new URL(this.openAiLogin?.verificationUrl || '')
        if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com') throw new Error('Untrusted URL')
        window.open(url.toString(), '_blank', 'noopener,noreferrer')
      } catch {
        this.notify(this.t('provider.chatgptLoginFailed'), 'error')
      }
    },

    async copyOpenAiCode() {
      try {
        await navigator.clipboard.writeText(this.openAiLogin?.userCode || '')
        this.notify(this.t('notification.codeCopied'))
      } catch {
        this.notify(this.t('error.requestFailed'), 'error')
      }
    },

    async pollOpenAiLogin() {
      const loginId = this.openAiLogin?.loginId
      if (!loginId || !this.settingsOpen || this.providerForm.id !== 'openai') {
        this.stopOpenAiLoginPolling()
        return
      }
      try {
        const response = await apiFetch(`/api/ai/providers/openai/chatgpt/status?loginId=${encodeURIComponent(loginId)}`)
        const status = await response.json()
        if (status.status === 'connected') {
          this.stopOpenAiLoginPolling()
          this.openAiLogin = null
          await this.refreshProviders(false)
          if (this.providerForm.id === 'openai') this.editProvider('openai')
          return
        }
        if (status.status === 'expired' || status.status === 'unknown') {
          this.stopOpenAiLoginPolling()
          this.openAiLogin = { ...this.openAiLogin, status: status.status }
          this.providerConnectionState = 'error'
          this.setProviderConnectionMessage(status.status === 'expired'
            ? 'provider.chatgptLoginExpired'
            : 'provider.chatgptLoginFailed')
        }
      } catch {
        this.stopOpenAiLoginPolling()
        this.providerConnectionState = 'error'
        this.setProviderConnectionMessage('provider.chatgptLoginFailed')
      }
    },

    async disconnectOpenAiSubscription() {
      if (this.providerBusy) return
      this.providerBusy = true
      try {
        await apiFetch('/api/ai/providers/openai/chatgpt', { method: 'DELETE' })
        this.stopOpenAiLoginPolling()
        this.openAiLogin = null
        await this.refreshProviders(false)
        if (this.providerForm.id === 'openai') this.editProvider('openai')
        this.notify(this.t('notification.chatgptDisconnected'))
      } catch {
        this.notify(this.t('provider.chatgptLogoutFailed'), 'error')
      } finally {
        this.providerBusy = false
      }
    },

    async generateAiSummary() {
      this.busy = true
      try {
        const snapshot = this.summarySnapshot()
        const hash = await summaryDatasetHash(snapshot, this.resolvedLanguage, SUMMARY_PROMPT_VERSION)
        const response = await apiFetch('/api/ai/insights', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot)
        })
        const generated = generatedInsightsSchema.parse(await response.json())
        const configurationFingerprint = normalizeInsightConfigurationFingerprint(
          response.headers.get('X-Bianco-AI-Configuration-Fingerprint')
        )
        if (!configurationFingerprint) throw new Error('Missing AI configuration fingerprint')
        this.insightConfigurationFingerprint = configurationFingerprint
        const generatedBy = { configurationFingerprint }
        const document = await database.settings.findOne('singleton').exec()
        await document.incrementalPatch({ aiSummary: {
          ...generated,
          generatedBy,
          promptVersion: SUMMARY_PROMPT_VERSION,
          datasetHash: hash,
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
        await downloadBackup(database, false)
        this.notify(this.t('notification.backupCreated'))
      } catch {
        this.notify(this.t('error.backupFailed'), 'error')
      } finally {
        this.busy = false
      }
    },

    async wipeLocalData() {
      const confirmed = await this.confirmAction({
        title: this.t('confirm.deleteAllDataTitle'),
        message: this.t('confirm.deleteAllData'),
        confirmLabel: this.t('common.delete'),
        destructive: true
      })
      if (!confirmed) return
      try {
        window.localStorage.removeItem(THEME_STORAGE_KEY)
        window.localStorage.removeItem(LANGUAGE_STORAGE_KEY)
      } catch { /* Storage may be disabled. */ }
      await deleteLocalDatabase()
      window.location.reload()
    },

    async logoutAndWipeLocalData() {
      if (!this.online || this.busy) return
      const confirmed = await this.confirmAction({
        title: this.t('confirm.logoutAndDeleteTitle'),
        message: this.t('confirm.logoutAndDelete'),
        confirmLabel: this.t('settings.account.signOutAndDelete'),
        destructive: true
      })
      if (!confirmed) return
      this.busy = true
      try {
        await deleteLocalDatabase()
        try {
          window.localStorage.removeItem(THEME_STORAGE_KEY)
          window.localStorage.removeItem(LANGUAGE_STORAGE_KEY)
        } catch { /* Storage may be disabled. */ }
        await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
        window.location.assign('/auth/login')
      } catch {
        this.notify(this.t('error.logoutFailed'), 'error')
        this.busy = false
      }
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
      const prompt = this.installPrompt
      if (!prompt) return
      this.installSuggestionVisible = false
      try {
        await prompt.prompt()
        const choice = await prompt.userChoice
        if (choice?.outcome !== 'accepted') this.rememberInstallDismissal()
      } finally {
        this.installPrompt = null
      }
    },

    shouldSuggestInstall() {
      if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) return false
      try {
        const dismissedAt = Number(window.localStorage.getItem(INSTALL_DISMISSED_STORAGE_KEY))
        return !Number.isFinite(dismissedAt) || dismissedAt <= 0 || Date.now() - dismissedAt >= INSTALL_DISMISSAL_TTL_MS
      } catch {
        return true
      }
    },

    rememberInstallDismissal() {
      try { window.localStorage.setItem(INSTALL_DISMISSED_STORAGE_KEY, String(Date.now())) } catch { /* Storage may be disabled. */ }
    },

    dismissInstallSuggestion() {
      this.installSuggestionVisible = false
      this.rememberInstallDismissal()
    },

    confirmAction({ title, message, confirmLabel, destructive = false }) {
      if (this.confirmationResolver) this.finishConfirmation(false)
      this.confirmation = { title, message, confirmLabel, destructive }
      this.confirmationReturnFocus = document.activeElement
      return new Promise((resolve) => {
        this.confirmationResolver = resolve
        this.$nextTick?.(() => {
          const dialog = this.$refs.confirmationDialog
          if (!dialog?.open) dialog?.showModal()
          this.$refs.confirmationTitle?.focus()
        })
      })
    },

    finishConfirmation(confirmed) {
      const resolve = this.confirmationResolver
      const returnFocus = this.confirmationReturnFocus
      this.confirmationResolver = null
      this.confirmationReturnFocus = null
      if (this.$refs.confirmationDialog?.open) this.$refs.confirmationDialog.close()
      resolve?.(confirmed)
      this.$nextTick?.(() => returnFocus?.focus?.())
    },

    onConfirmationClosed() {
      if (this.confirmationResolver) this.finishConfirmation(false)
    },

    applyUpdate() {
      if (this.capture.processing || this.capture.saving || this.detail.dirty) {
        this.notify(this.t('notification.updateDeferred'))
        return
      }
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
