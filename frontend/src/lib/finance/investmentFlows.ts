/** Ledger amounts are positive magnitudes; direction comes from type and account legs. */
export interface InvestmentFlowTransaction {
  type: string
  amount: number
  account?: string | null
  from_account?: string | null
  to_account?: string | null
}

export type InvestmentAccountTest = (name: string | null | undefined) => boolean

export interface InvestmentAccountDelta {
  account: string
  amount: number
}

export interface InvestmentTransferSummary {
  contributions: number
  withdrawals: number
  netContributions: number
  internalTransfers: number
  otherTransfers: number
}

/** Bind exact membership to the user's configured investment accounts. */
export function investmentAccountTest(accounts: readonly string[]): InvestmentAccountTest {
  const names = new Set(accounts)
  return (name) => name != null && names.has(name)
}

/**
 * Net new money crossing the investment perimeter. Internal moves cancel;
 * redemptions subtract. Income and expenses are not transfer contributions.
 */
export function investmentTransferDelta(
  tx: InvestmentFlowTransaction,
  isInvestment: InvestmentAccountTest,
): number {
  if (tx.type !== 'Transfer') return 0
  return tx.amount * (Number(isInvestment(tx.to_account)) - Number(isInvestment(tx.from_account)))
}

/** Both legs remain visible when money moves between two investment accounts. */
export function investmentAccountDeltas(
  tx: InvestmentFlowTransaction,
  isInvestment: InvestmentAccountTest,
): InvestmentAccountDelta[] {
  const deltas: InvestmentAccountDelta[] = []
  if (tx.type === 'Transfer') {
    if (tx.from_account && isInvestment(tx.from_account)) {
      deltas.push({ account: tx.from_account, amount: -tx.amount })
    }
    if (tx.to_account && isInvestment(tx.to_account)) {
      deltas.push({ account: tx.to_account, amount: tx.amount })
    }
    return deltas
  }
  if (!tx.account || !isInvestment(tx.account)) return deltas
  if (tx.type === 'Income') deltas.push({ account: tx.account, amount: tx.amount })
  if (tx.type === 'Expense') deltas.push({ account: tx.account, amount: -tx.amount })
  return deltas
}

/** Partition transfer volume once; internal moves do not change net contributions. */
export function summarizeInvestmentTransfers(
  transactions: readonly InvestmentFlowTransaction[],
  isInvestment: InvestmentAccountTest,
): InvestmentTransferSummary {
  const summary: InvestmentTransferSummary = {
    contributions: 0,
    withdrawals: 0,
    netContributions: 0,
    internalTransfers: 0,
    otherTransfers: 0,
  }
  for (const tx of transactions) {
    if (tx.type !== 'Transfer') continue
    const delta = investmentTransferDelta(tx, isInvestment)
    if (delta > 0) summary.contributions += delta
    else if (delta < 0) summary.withdrawals -= delta
    else if (isInvestment(tx.from_account) && isInvestment(tx.to_account)) {
      summary.internalTransfers += tx.amount
    } else {
      summary.otherTransfers += tx.amount
    }
  }
  summary.netContributions = summary.contributions - summary.withdrawals
  return summary
}

export function netInvestmentTransferFlow(
  transactions: readonly InvestmentFlowTransaction[],
  isInvestment: InvestmentAccountTest,
): number {
  return summarizeInvestmentTransfers(transactions, isInvestment).netContributions
}
