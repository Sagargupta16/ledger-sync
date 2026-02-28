export const queryKeys = {
  analytics: {
    all: ['analytics'] as const,
    overview: (params?: Record<string, unknown>) => ['analytics', 'overview', params] as const,
    kpis: (params?: Record<string, unknown>) => ['analytics', 'kpis', params] as const,
    behavior: (params?: Record<string, unknown>) => ['analytics', 'behavior', params] as const,
    trends: (params?: Record<string, unknown>) => ['analytics', 'trends', params] as const,
  },
  calculations: {
    all: ['calculations'] as const,
    totals: (params?: Record<string, unknown>) => ['calculations', 'totals', params] as const,
    monthly: (params?: Record<string, unknown>) => ['calculations', 'monthly', params] as const,
    categories: (params?: Record<string, unknown>) => ['calculations', 'categories', params] as const,
    accountBalances: (params?: Record<string, unknown>) => ['calculations', 'accountBalances', params] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    list: (params?: Record<string, unknown>) => ['transactions', 'list', params] as const,
    recent: (params?: Record<string, unknown>) => ['transactions', 'recent', params] as const,
  },
  auth: {
    all: ['auth'] as const,
    init: ['auth', 'init'] as const,
  },
} as const
