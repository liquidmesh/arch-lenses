import { LENSES, type LensKey, type LensDefinition } from '../types'
import { getAllLenses } from '../db'

const LENS_ORDER_KEY = 'arch-lenses-order'

// Cache for lenses loaded from database
let lensesCache: LensDefinition[] | null = null
let lensesCachePromise: Promise<LensDefinition[]> | null = null

export async function loadLensesFromDB(): Promise<LensDefinition[]> {
  if (lensesCache) return lensesCache
  if (lensesCachePromise) return lensesCachePromise
  
  lensesCachePromise = (async () => {
    try {
      const dbLenses = await getAllLenses()
      if (dbLenses.length > 0) {
        lensesCache = dbLenses
        return dbLenses
      }
    } catch (e) {
      console.error('Failed to load lenses from DB:', e)
    }
    // Fallback to default lenses
    lensesCache = LENSES
    return LENSES
  })()
  
  return lensesCachePromise
}

export function invalidateLensesCache() {
  lensesCache = null
  lensesCachePromise = null
}

export async function getLensOrder(): Promise<LensKey[]> {
  const lenses = await loadLensesFromDB()
  try {
    const stored = localStorage.getItem(LENS_ORDER_KEY)
    if (stored) {
      const order = JSON.parse(stored) as LensKey[]
      // Validate that all lenses are present
      const allKeys = new Set(lenses.map(l => l.key))
      const orderKeys = new Set(order)
      if (orderKeys.size === allKeys.size && [...orderKeys].every(k => allKeys.has(k))) {
        return order
      }
    }
  } catch (e) {
    // Ignore errors
  }
  // Return default order
  return lenses.map(l => l.key)
}

export function saveLensOrder(order: LensKey[]): void {
  try {
    localStorage.setItem(LENS_ORDER_KEY, JSON.stringify(order))
  } catch (e) {
    console.error('Failed to save lens order:', e)
  }
}

// Sync version for backward compatibility
export function getOrderedLenses(): LensDefinition[] {
  const order = getLensOrderSync()
  // Create a map for quick lookup
  const orderMap = new Map(order.map((key, idx) => [key, idx]))
  // Sort lenses by their order
  return [...LENSES].sort((a, b) => {
    const aIdx = orderMap.get(a.key) ?? 999
    const bIdx = orderMap.get(b.key) ?? 999
    return aIdx - bIdx
  })
}

export function getLensOrderSync(): LensKey[] {
  try {
    const stored = localStorage.getItem(LENS_ORDER_KEY)
    if (stored) {
      const order = JSON.parse(stored) as LensKey[]
      // Return the stored order if it exists (validation happens at save time)
      // This allows the order to work with lenses loaded from the database
      return order
    }
  } catch (e) {
    // Ignore errors
  }
  // Return default order from static LENSES as fallback
  return LENSES.map(l => l.key)
}

// Async version that loads from database
export async function getOrderedLensesAsync(): Promise<LensDefinition[]> {
  const lenses = await loadLensesFromDB()
  const order = await getLensOrder()
  // Create a map for quick lookup
  const orderMap = new Map(order.map((key, idx) => [key, idx]))
  // Sort lenses by their order
  return [...lenses].sort((a, b) => {
    const aIdx = orderMap.get(a.key) ?? 999
    const bIdx = orderMap.get(b.key) ?? 999
    return aIdx - bIdx
  })
}

