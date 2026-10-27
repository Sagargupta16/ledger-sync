import type { PotId } from '@/lib/finance/monteCarlo'
import { resolveAccountCategory } from '@/pages/net-worth/netWorthUtils'

/** Investment types (Settings, investment mappings) counted as debt; every other investment is equity. */
const DEBT_INVESTMENT_TYPES: ReadonlySet<string> = new Set(['ppf_epf', 'fixed_deposits'])

export interface PotSeed {
  readonly balances: Readonly<Record<PotId, number>>
  /** Every balance summed: assets less liabilities, the Net Worth page's figure. */
  readonly netWorth: number
}

function potFor(
  name: string,
  classifications: Readonly<Record<string, string>>,
  mappings: Readonly<Record<string, string>>,
): PotId {
  if (resolveAccountCategory(name, classifications, mappings) !== 'Investments') return 'cash'
  return DEBT_INVESTMENT_TYPES.has(mappings[name] ?? '') ? 'debt' : 'equity'
}

/**
 * Splits today's net worth into the simulation's pots. Investment accounts are
 * equity unless mapped as PPF/EPF or fixed deposits (debt); everything else
 * (bank, wallets, money lent, cards and loans) nets into cash. A pot left
 * negative, such as a card balance larger than the bank, is taken from the
 * others pro rata, so the pots add up to net worth, or to zero when net worth
 * is not positive. Book values, like the rest of the app.
 */
export function seedPotsFromAccounts(
  accounts: Readonly<Record<string, { readonly balance: number }>>,
  classifications: Readonly<Record<string, string>>,
  mappings: Readonly<Record<string, string>>,
): PotSeed {
  const raw: Record<PotId, number> = { equity: 0, debt: 0, cash: 0 }
  for (const [name, { balance }] of Object.entries(accounts)) {
    raw[potFor(name, classifications, mappings)] += balance
  }
  const netWorth = raw.equity + raw.debt + raw.cash
  if (netWorth <= 0) return { balances: { equity: 0, debt: 0, cash: 0 }, netWorth }
  const positive = Math.max(0, raw.equity) + Math.max(0, raw.debt) + Math.max(0, raw.cash)
  const scale = netWorth / positive
  return {
    balances: {
      equity: Math.max(0, raw.equity) * scale,
      debt: Math.max(0, raw.debt) * scale,
      cash: Math.max(0, raw.cash) * scale,
    },
    netWorth,
  }
}
