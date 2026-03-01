// Utility barrel — re-exports for cleaner imports
export { cn } from './cn'
export { queryClient } from './queryClient'
export { prefetchCoreData } from './prefetch'
export * from './formatters'
export * from './dateUtils'
export * from './chartUtils'
export * from './chartPeriodUtils'
export * from './errorUtils'
export * from './exportCsv'
export * from './preferencesUtils'
// taxCalculator and transactionUtils have overlapping exports with dateUtils
// (getFYFromDate, filterTransactionsByDateRange) — import them directly:
//   import { calculateTax } from '@/lib/taxCalculator'
//   import { computeCategoryBreakdown } from '@/lib/transactionUtils'
