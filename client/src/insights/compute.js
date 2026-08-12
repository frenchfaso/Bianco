const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const AUTHORITATIVE_STATUSES = new Set(['confirmed', 'manual'])
const CATEGORY_RECONCILIATION_TOLERANCE_MINOR = 2

function dateOnlyValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return Number.NaN
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const result = Date.UTC(year, month, day)
  const parsed = new Date(result)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month && parsed.getUTCDate() === day
    ? result
    : Number.NaN
}

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function stableSortByTotal(entries) {
  return entries.sort((left, right) => right.total - left.total || String(left.id).localeCompare(String(right.id)))
}

function isAuthoritativeReceipt(receipt) {
  return AUTHORITATIVE_STATUSES.has(receipt.status)
}

export function spendingSeries(receipts, granularity, now = new Date(), bucketCount = 12) {
  const count = Math.max(1, Math.trunc(bucketCount))
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  let firstStart
  let bucketFor
  let bucketStart

  if (granularity === 'week') {
    const weekday = (new Date(today).getUTCDay() + 6) % 7
    const currentStart = today - weekday * DAY_MS
    firstStart = currentStart - (count - 1) * WEEK_MS
    bucketFor = (value) => Math.floor((value - firstStart) / WEEK_MS)
    bucketStart = (index) => firstStart + index * WEEK_MS
  } else if (granularity === 'month') {
    const currentMonth = Date.UTC(now.getFullYear(), now.getMonth(), 1)
    const firstDate = new Date(currentMonth)
    firstDate.setUTCMonth(firstDate.getUTCMonth() - (count - 1))
    firstStart = firstDate.getTime()
    const firstYear = firstDate.getUTCFullYear()
    const firstMonth = firstDate.getUTCMonth()
    bucketFor = (value) => {
      const date = new Date(value)
      return (date.getUTCFullYear() - firstYear) * 12 + date.getUTCMonth() - firstMonth
    }
    bucketStart = (index) => Date.UTC(firstYear, firstMonth + index, 1)
  } else {
    throw new TypeError(`Unsupported spending granularity: ${granularity}`)
  }

  const buckets = Array.from({ length: count }, (_, index) => ({
    start: isoDate(bucketStart(index)),
    total: 0
  }))
  for (const receipt of receipts) {
    const value = dateOnlyValue(receipt.transactionDate)
    const total = Number(receipt.totalMinor)
    if (!Number.isFinite(value) || !Number.isFinite(total) || total < 0) continue
    const index = bucketFor(value)
    if (index >= 0 && index < count) buckets[index].total += total
  }
  return buckets
}

function percentChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

function aggregateBy(receipts, keyOf) {
  const map = new Map()
  for (const receipt of receipts) {
    const key = keyOf(receipt) || 'other'
    const value = map.get(key) || { id: key, total: 0, count: 0 }
    value.total += receipt.totalMinor || 0
    value.count += 1
    map.set(key, value)
  }
  return map
}

function addCategoryTotal(totals, id, total) {
  if (total <= 0) return
  const entry = totals.get(id) || { id, total: 0, count: 0 }
  entry.total += total
  entry.count += 1
  totals.set(id, entry)
}

function aggregateCategories(receipts, items) {
  const itemsByReceipt = new Map()
  for (const item of items) {
    const receiptItems = itemsByReceipt.get(item.receiptId) || []
    receiptItems.push(item)
    itemsByReceipt.set(item.receiptId, receiptItems)
  }
  const totals = new Map()
  for (const receipt of receipts) {
    const categoryTotals = new Map()
    for (const item of itemsByReceipt.get(receipt.id) || []) {
      const amount = Number(item.totalPriceMinor)
      if (!Number.isFinite(amount) || amount <= 0) continue
      const categoryId = item.categoryId || 'other'
      categoryTotals.set(categoryId, (categoryTotals.get(categoryId) || 0) + amount)
    }
    if (!categoryTotals.size) {
      addCategoryTotal(totals, receipt.categoryId || 'other', receipt.totalMinor || 0)
      continue
    }

    const itemTotal = [...categoryTotals.values()].reduce((sum, value) => sum + value, 0)
    const receiptTotal = Number(receipt.totalMinor)
    if (Number.isFinite(receiptTotal) && itemTotal > receiptTotal + CATEGORY_RECONCILIATION_TOLERANCE_MINOR) {
      // Inconsistent line items must not inflate a category. Keep the trusted
      // receipt total visible, but classify it as unknown until it is reviewed.
      addCategoryTotal(totals, 'other', receiptTotal)
      continue
    }

    for (const [id, total] of categoryTotals) addCategoryTotal(totals, id, total)
    if (Number.isFinite(receiptTotal)) {
      const residual = receiptTotal - itemTotal
      if (residual > CATEGORY_RECONCILIATION_TOLERANCE_MINOR) {
        addCategoryTotal(totals, 'other', residual)
      }
    }
  }
  return totals
}

export const UNKNOWN_MERCHANT_ID = '__unknown_merchant__'

function currentPeriod(now) {
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const start = Date.UTC(now.getFullYear(), now.getMonth(), 1)
  const previousStart = Date.UTC(now.getFullYear(), now.getMonth() - 1, 1)
  const previousMonthLastDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0)).getUTCDate()
  const previousEnd = Date.UTC(
    new Date(previousStart).getUTCFullYear(),
    new Date(previousStart).getUTCMonth(),
    Math.min(now.getDate(), previousMonthLastDay)
  )
  return { start, end, previousStart, previousEnd }
}

function inRange(receipt, start, end) {
  const value = dateOnlyValue(receipt.transactionDate)
  return Number.isFinite(value) && value >= start && value <= end
}

function mergedComparison(currentMap, previousMap) {
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()])
  return [...keys].map((id) => {
    const current = currentMap.get(id) || { total: 0, count: 0 }
    const previous = previousMap.get(id) || { total: 0, count: 0 }
    return {
      id,
      total: current.total,
      count: current.count,
      previousTotal: previous.total,
      difference: current.total - previous.total,
      changePercent: percentChange(current.total, previous.total)
    }
  })
}

function comparisonIdentity(item) {
  const normalized = (item.normalizedName || '').trim().toLocaleLowerCase()
  const raw = (item.rawName || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
  if (!normalized || !raw || !item.categoryId) return null
  const quantity = Number(item.quantity)
  const unitPrice = Number(item.unitPriceMinor)
  const totalPrice = Number(item.totalPriceMinor)
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) return null
  if (!Number.isFinite(totalPrice) || Math.abs(totalPrice - Math.round(quantity * unitPrice)) > 2) return null
  return `${normalized}\u0000${raw}\u0000${item.categoryId}\u0000${quantity}`
}

function productInsights(items, receipts, currentIds) {
  const current = new Map()
  const prices = new Map()
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  for (const item of items) {
    const name = (item.normalizedName || item.rawName || '').trim()
    if (!name || !receiptById.has(item.receiptId)) continue
    if (currentIds.has(item.receiptId)) {
      const value = current.get(name) || { id: name, total: 0, quantity: 0, frequency: 0 }
      value.total += item.totalPriceMinor || 0
      value.quantity += item.quantity ?? 1
      value.frequency += 1
      current.set(name, value)
    }
    const identity = comparisonIdentity(item)
    if (identity) {
      const observations = prices.get(identity) || []
      observations.push({
        id: name,
        price: item.unitPriceMinor,
        date: receiptById.get(item.receiptId)?.transactionDate || '',
        receiptId: item.receiptId
      })
      prices.set(identity, observations)
    }
  }

  const priceChanges = []
  for (const observations of prices.values()) {
    const distinctReceipts = new Set(observations.map((entry) => entry.receiptId))
    // Two OCR observations are too weak for a price claim. Three exact,
    // arithmetically consistent observations provide a conservative baseline.
    if (distinctReceipts.size < 3) continue
    observations.sort((left, right) => left.date.localeCompare(right.date) || left.receiptId.localeCompare(right.receiptId))
    const latest = observations.at(-1).price
    const previous = observations.slice(0, -1)
    const previousAverage = Math.round(previous.reduce((sum, entry) => sum + entry.price, 0) / previous.length)
    priceChanges.push({
      id: observations.at(-1).id,
      latest,
      previousAverage,
      difference: latest - previousAverage,
      changePercent: percentChange(latest, previousAverage)
    })
  }
  return {
    products: stableSortByTotal([...current.values()]),
    priceChanges: priceChanges.sort((a, b) =>
      Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0) || a.id.localeCompare(b.id)
    )
  }
}

function deterministicInsights(categories, merchants, products, priceChanges, minimumMinor, minimumPercent) {
  const insights = []
  const significant = (entry) =>
    Math.abs(entry.difference) >= minimumMinor &&
    entry.changePercent != null && Math.abs(entry.changePercent) >= minimumPercent

  const category = categories.filter(significant).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))[0]
  if (category) insights.push({ type: 'category', ...category })
  const merchant = merchants.filter(significant).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))[0]
  if (merchant) insights.push({ type: 'merchant', ...merchant })
  const frequent = products.filter((entry) => entry.frequency >= 2).sort((a, b) => b.frequency - a.frequency)[0]
  if (frequent) insights.push({ type: 'frequency', ...frequent })
  const price = priceChanges.find((entry) =>
    Math.abs(entry.difference) >= minimumMinor &&
    entry.changePercent != null && Math.abs(entry.changePercent) >= minimumPercent
  )
  if (price) insights.push({ type: 'price', ...price })
  return insights.slice(0, 3)
}

export function computeInsights(receipts, items, options = {}) {
  const now = options.now || new Date()
  const minimumMinor = options.minimumMinor ?? 1000
  const minimumPercent = options.minimumPercent ?? 20
  const period = currentPeriod(now)
  const usable = receipts.filter((receipt) =>
    isAuthoritativeReceipt(receipt) && receipt.totalMinor != null && receipt.transactionDate
  )
  const usableIds = new Set(usable.map((receipt) => receipt.id))
  const usableItems = items.filter((item) => usableIds.has(item.receiptId))
  const current = usable.filter((receipt) => inRange(receipt, period.start, period.end))
  const previous = usable.filter((receipt) => inRange(receipt, period.previousStart, period.previousEnd))
  const total = current.reduce((sum, receipt) => sum + receipt.totalMinor, 0)
  const previousTotal = previous.reduce((sum, receipt) => sum + receipt.totalMinor, 0)
  const categories = stableSortByTotal(mergedComparison(
    aggregateCategories(current, usableItems),
    aggregateCategories(previous, usableItems)
  ))
  const merchants = stableSortByTotal(mergedComparison(
    aggregateBy(current, (receipt) => receipt.merchantNormalized || receipt.merchantRaw || UNKNOWN_MERCHANT_ID),
    aggregateBy(previous, (receipt) => receipt.merchantNormalized || receipt.merchantRaw || UNKNOWN_MERCHANT_ID)
  ))
  const currentIds = new Set(current.map((receipt) => receipt.id))
  const { products, priceChanges } = productInsights(usableItems, usable, currentIds)
  const totalDifference = total - previousTotal
  return {
    period: {
      start: isoDate(period.start),
      end: isoDate(period.end),
      previousStart: isoDate(period.previousStart),
      previousEnd: isoDate(period.previousEnd)
    },
    total,
    previousTotal,
    difference: totalDifference,
    changePercent: percentChange(total, previousTotal),
    categories,
    merchants,
    products,
    priceChanges,
    spending: {
      weekly: spendingSeries(usable, 'week', now),
      monthly: spendingSeries(usable, 'month', now)
    },
    deterministic: deterministicInsights(
      categories, merchants, products, priceChanges, minimumMinor, minimumPercent
    )
  }
}

export function insightSnapshot(insights) {
  return {
    period: insights.period,
    total: insights.total,
    previousTotal: insights.previousTotal,
    categories: insights.categories,
    merchants: insights.merchants,
    items: insights.products,
    priceChanges: insights.priceChanges
  }
}
