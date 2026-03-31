/**
 * Indian average household spending benchmarks as % of income.
 *
 * Sources:
 * - NSS 79th Round (2022-23) Household Consumer Expenditure Survey
 * - RBI Handbook of Statistics on Indian Economy
 * - MOSPI Annual Survey of Industries
 *
 * These represent urban middle-class averages (monthly income 50k-1.5L bracket).
 * Categories are mapped to Money Manager Pro category names used in this app.
 */
export const INDIAN_SPENDING_BENCHMARKS: Record<string, number> = {
  // Category name -> recommended % of gross income
  'Food': 25,
  'Groceries': 25,
  'Housing': 20,
  'Rent': 20,
  'Transport': 10,
  'Transportation': 10,
  'Healthcare': 5,
  'Health': 5,
  'Medical': 5,
  'Education': 8,
  'Entertainment': 5,
  'Shopping': 7,
  'Clothing': 5,
  'Utilities': 5,
  'Bills': 5,
  'Insurance': 4,
  'Personal Care': 3,
  'Dining Out': 5,
  'Restaurants': 5,
  'Travel': 5,
  'Vacation': 5,
  'Gifts': 2,
  'Donations': 2,
  'Subscriptions': 3,
  'Phone': 2,
  'Internet': 2,
  'Fuel': 5,
  'Household': 4,
}

/**
 * Normalized benchmark lookup -- case-insensitive, returns undefined if no match.
 */
export function getBenchmarkForCategory(category: string): number | undefined {
  // Try exact match first
  if (category in INDIAN_SPENDING_BENCHMARKS) return INDIAN_SPENDING_BENCHMARKS[category]
  // Try case-insensitive
  const lower = category.toLowerCase()
  for (const [key, value] of Object.entries(INDIAN_SPENDING_BENCHMARKS)) {
    if (key.toLowerCase() === lower) return value
  }
  // Try partial match (e.g., "Food & Dining" matches "Food")
  for (const [key, value] of Object.entries(INDIAN_SPENDING_BENCHMARKS)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return value
  }
  return undefined
}
