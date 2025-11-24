import { LENSES, type LensKey } from '../types'

const LENS_ORDER_KEY = 'arch-lenses-order'

export function getLensOrder(): LensKey[] {
  try {
    const stored = localStorage.getItem(LENS_ORDER_KEY)
    if (stored) {
      const order = JSON.parse(stored) as LensKey[]
      // Validate that all lenses are present
      const allKeys = new Set(LENSES.map(l => l.key))
      const orderKeys = new Set(order)
      if (orderKeys.size === allKeys.size && [...orderKeys].every(k => allKeys.has(k))) {
        return order
      }
    }
  } catch (e) {
    // Ignore errors
  }
  // Return default order
  return LENSES.map(l => l.key)
}

export function saveLensOrder(order: LensKey[]): void {
  try {
    localStorage.setItem(LENS_ORDER_KEY, JSON.stringify(order))
  } catch (e) {
    console.error('Failed to save lens order:', e)
  }
}

export function getOrderedLenses() {
  const order = getLensOrder()
  // Create a map for quick lookup
  const orderMap = new Map(order.map((key, idx) => [key, idx]))
  // Sort lenses by their order
  return [...LENSES].sort((a, b) => {
    const aIdx = orderMap.get(a.key) ?? 999
    const bIdx = orderMap.get(b.key) ?? 999
    return aIdx - bIdx
  })
}

