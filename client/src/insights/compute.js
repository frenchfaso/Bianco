function dateValue(value) {
  return value ? new Date(`${value}T12:00:00`).getTime() : Number.NaN
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

export const UNKNOWN_MERCHANT_ID = '__unknown_merchant__'

function currentPeriod(now) {
  const end = new Date(now)
  const start = new Date(end.getFullYear(), end.getMonth(), 1)
  const previousStart = new Date(end.getFullYear(), end.getMonth() - 1, 1)
  const previousMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate()
  const previousEnd = new Date(
    previousStart.getFullYear(),
    previousStart.getMonth(),
    Math.min(end.getDate(), previousMonthLastDay),
    23, 59, 59, 999
  )
  return { start, end, previousStart, previousEnd }
}

function inRange(receipt, start, end) {
  const value = dateValue(receipt.transactionDate)
  return Number.isFinite(value) && value >= start.getTime() && value <= end.getTime()
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

function productInsights(items, receipts, currentIds) {
  const current = new Map()
  const prices = new Map()
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  for (const item of items) {
    const name = (item.normalizedName || item.rawName || '').trim()
    if (!name) continue
    if (currentIds.has(item.receiptId)) {
      const value = current.get(name) || { id: name, total: 0, quantity: 0, frequency: 0 }
      value.total += item.totalPriceMinor || 0
      value.quantity += item.quantity ?? 1
      value.frequency += 1
      current.set(name, value)
    }
    if (item.unitPriceMinor != null) {
      const observations = prices.get(name) || []
      observations.push({
        price: item.unitPriceMinor,
        date: receiptById.get(item.receiptId)?.transactionDate || ''
      })
      prices.set(name, observations)
    }
  }

  const priceChanges = []
  for (const [name, observations] of prices) {
    if (observations.length < 2) continue
    observations.sort((left, right) => left.date.localeCompare(right.date))
    const latest = observations.at(-1).price
    const previous = observations.slice(0, -1)
    const previousAverage = Math.round(previous.reduce((sum, entry) => sum + entry.price, 0) / previous.length)
    priceChanges.push({
      id: name,
      latest,
      previousAverage,
      difference: latest - previousAverage,
      changePercent: percentChange(latest, previousAverage)
    })
  }
  return {
    products: [...current.values()].sort((a, b) => b.total - a.total),
    priceChanges: priceChanges.sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0))
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
  return insights.slice(0, 4)
}

export function computeInsights(receipts, items, options = {}) {
  const now = options.now || new Date()
  const minimumMinor = options.minimumMinor ?? 1000
  const minimumPercent = options.minimumPercent ?? 20
  const period = currentPeriod(now)
  const usable = receipts.filter((receipt) => receipt.totalMinor != null && receipt.transactionDate)
  const current = usable.filter((receipt) => inRange(receipt, period.start, period.end))
  const previous = usable.filter((receipt) => inRange(receipt, period.previousStart, period.previousEnd))
  const total = current.reduce((sum, receipt) => sum + receipt.totalMinor, 0)
  const previousTotal = previous.reduce((sum, receipt) => sum + receipt.totalMinor, 0)
  const categories = mergedComparison(
    aggregateBy(current, (receipt) => receipt.categoryId),
    aggregateBy(previous, (receipt) => receipt.categoryId)
  ).sort((a, b) => b.total - a.total)
  const merchants = mergedComparison(
    aggregateBy(current, (receipt) => receipt.merchantNormalized || receipt.merchantRaw || UNKNOWN_MERCHANT_ID),
    aggregateBy(previous, (receipt) => receipt.merchantNormalized || receipt.merchantRaw || UNKNOWN_MERCHANT_ID)
  ).sort((a, b) => b.total - a.total)
  const currentIds = new Set(current.map((receipt) => receipt.id))
  const { products, priceChanges } = productInsights(items, usable, currentIds)
  const totalDifference = total - previousTotal
  return {
    period: {
      start: period.start.toISOString().slice(0, 10),
      end: period.end.toISOString().slice(0, 10),
      previousStart: period.previousStart.toISOString().slice(0, 10),
      previousEnd: period.previousEnd.toISOString().slice(0, 10)
    },
    total,
    previousTotal,
    difference: totalDifference,
    changePercent: percentChange(total, previousTotal),
    categories,
    merchants,
    products,
    priceChanges,
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
