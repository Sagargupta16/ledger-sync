/**
 * Demo AIS: a sample statement built from the demo ledger, and the demo answer
 * for `GET /api/tax-ais` and `GET /api/tax-ais/{tax_year}`.
 *
 * The saved demo summary is what the real parser makes of that same sample,
 * so /tax and /tax/ais show the same figures. The sample reports every demo
 * salary credit with the ledger's own "TDS" rows for that month (10% where a
 * month has none), each account's interest as one annual SFT line, and each
 * dividend, except that it adds one deposit interest line the ledger never
 * recorded and leaves out the year's last dividend: one example for each
 * reconciliation list. Nothing in it is real tax data.
 */

import { getTodayKey } from '@/lib/dateKeys'
import { classifyEmploymentIncome, phrasePattern } from '@/lib/finance/metricRules'
import { parseAisDocument } from '@/lib/tax/aisParser'
import { buildAisStatement } from '@/lib/tax/aisSummary'
import { taxYearKey } from '@/lib/tax-config/taxYear'
import type { TaxAisSummary } from '@/services/api/taxAis'
import type { Transaction } from '@/types'

const SAMPLE_TDS_RATE = 0.1
const SAMPLE_EMPLOYER = 'DEMO TECHNOLOGIES PVT LTD (BLRD01234E)'
const UNRECORDED_DEPOSIT_INTEREST = 4250
const INTEREST = phrasePattern(['interest'])
const DIVIDEND = phrasePattern(['dividend', 'dividends'])
const GAINS = phrasePattern(['profit', 'profits', 'gain', 'gains'])
const TDS = phrasePattern(['tds'])

const aisDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const yearStart = (date: string) => (Number(date.slice(5, 7)) >= 4 ? Number(date.slice(0, 4)) : Number(date.slice(0, 4)) - 1)
const table = (columnLabel: string[], columnData: unknown[][]) => ({ columnLabel, columnData })
const matches = (pattern: RegExp | null, t: Transaction) => pattern?.test(`${t.category} ${t.subcategory ?? ''}`) ?? false

/**
 * One section-192 row per salary credit. A month's recorded TDS rides on its
 * first salary credit, as one payroll run; a credit with none left in its
 * month (a bonus, say) gets 10%.
 */
function salaryRowsOf(txs: readonly Transaction[], salary: readonly Transaction[], start: number): (string | number)[][] {
  const tdsByMonth = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'Expense' || yearStart(t.date) !== start || !matches(TDS, t)) continue
    tdsByMonth.set(t.date.slice(0, 7), (tdsByMonth.get(t.date.slice(0, 7)) ?? 0) + Math.abs(t.amount))
  }
  return salary.map((t, index) => {
    const month = t.date.slice(0, 7)
    const recorded = tdsByMonth.get(month)
    tdsByMonth.delete(month)
    const tds = recorded ?? Math.round((t.amount / (1 - SAMPLE_TDS_RATE)) * SAMPLE_TDS_RATE)
    const gross = t.amount + tds
    return [index + 1, aisDate(t.date), '192', String(gross), String(tds), String(tds), 'Active']
  })
}

function tdsSection(salaryRows: (string | number)[][], grossSalary: number) {
  return {
    title: 'TDS/TCS Information',
    elements: [{
      title: 'Salary',
      code: 'TDS-192',
      l1Src: SAMPLE_EMPLOYER,
      l1: table(['Information Source', 'Count', 'Amount'], [[SAMPLE_EMPLOYER, String(salaryRows.length), String(grossSalary)]]),
      l2: table(
        ['Sr. No.', 'Date of payment/credit', 'Section', 'Amount paid/credited', 'TDS deducted', 'TDS deposited', 'Status'],
        salaryRows,
      ),
    }],
  }
}

/**
 * Each account's interest as one annual line, one deposit interest line the
 * ledger never recorded, every dividend but the year's last, and each gain as
 * a sale.
 */
function sftSection(income: readonly Transaction[], start: number) {
  const interestByAccount = new Map<string, number>()
  for (const t of income.filter((row) => matches(INTEREST, row))) {
    interestByAccount.set(t.account, (interestByAccount.get(t.account) ?? 0) + t.amount)
  }
  const reportedOn = `30/06/${start + 1}`
  return {
    title: 'SFT Information',
    elements: [
      ...[...interestByAccount].map(([account, amount]) => ({
        title: 'Interest income',
        code: 'SFT-016(SB)',
        l1Src: account,
        l2: table(['Reported On', 'Account Type', 'Interest Amount'], [[reportedOn, 'Savings', String(amount)]]),
      })),
      {
        title: 'Interest income',
        code: 'SFT-016(TD)',
        l1Src: 'DEMO SMALL FINANCE BANK LTD',
        l2: table(['Reported On', 'Account Type', 'Interest Amount'], [[reportedOn, 'Term deposit', String(UNRECORDED_DEPOSIT_INTEREST)]]),
      },
      ...income.filter((t) => matches(DIVIDEND, t)).slice(0, -1).map((t) => ({
        title: 'Dividend income',
        code: 'SFT-015',
        l1Src: 'DEMO REGISTRAR (ON BEHALF OF LISTED COMPANIES)',
        l2: table(['Date of credit', 'Amount'], [[aisDate(t.date), String(t.amount)]]),
      })),
      // No information code: the code of this category is not confirmed, and the parser never needs one.
      ...income.filter((t) => matches(GAINS, t)).map((t) => ({
        title: 'Sale of securities and units of mutual fund',
        l1Src: 'DEMO BROKING LTD',
        l2: table(['Date of sale/transfer', 'Security name', 'Sale consideration'], [[aisDate(t.date), 'Sample holding', String(Math.round(t.amount / 0.12))]]),
      })),
    ],
  }
}

function otherInformationSection(grossSalary: number) {
  return {
    title: 'Other Information',
    elements: [{
      title: 'Salary (Annexure II of Form 24Q)',
      l1Src: SAMPLE_EMPLOYER,
      l1: table(['Employer', 'Gross Salary', 'Salary u/s 17(1)'], [[SAMPLE_EMPLOYER, String(grossSalary), String(grossSalary)]]),
    }],
  }
}

/** A decrypted-AIS-shaped document for one tax year ("2025-26") of the demo ledger. */
export function buildSampleAisDocument(txs: readonly Transaction[], taxYear: string): unknown {
  const start = Number(taxYear.slice(0, 4))
  const income = txs
    .filter((t) => t.type === 'Income' && yearStart(t.date) === start)
    .sort((a, b) => a.date.localeCompare(b.date))
  const salaryRows = salaryRowsOf(txs, income.filter((t) => classifyEmploymentIncome(t) !== null), start)
  const grossSalary = salaryRows.reduce((sum, row) => sum + Number(row[3]), 0)
  return {
    partA: table(['Financial Year', 'Assessment Year'], [[taxYear, taxYearKey(start + 1)]]),
    partB: { sections: [tdsSection(salaryRows, grossSalary), sftSection(income, start), otherInformationSection(grossSalary)] },
  }
}

/** The latest tax year whose AIS has settled (mid-June after it ends) and that has demo income. */
function demoSavedSummary(txs: readonly Transaction[]): TaxAisSummary | null {
  const today = getTodayKey()
  const starts = new Set(txs.filter((t) => t.type === 'Income').map((t) => yearStart(t.date)))
  const start = [...starts].filter((year) => `${year + 1}-06-15` <= today).sort((a, b) => b - a)[0]
  if (start === undefined) return null
  const taxYear = taxYearKey(start)
  const { summary } = buildAisStatement(parseAisDocument(buildSampleAisDocument(txs, taxYear)))
  return {
    tax_year: taxYear,
    tds_salary: summary.tdsSalary,
    tds_other: summary.tdsOther,
    interest: summary.interest,
    dividends: summary.dividends,
    updated_at: `${start + 1}-06-15T04:30:00+00:00`,
  }
}

/** Demo answer for `GET /api/tax-ais` (the list) and `GET /api/tax-ais/{tax_year}` (one year or null). */
export function generateDemoTaxAis(
  txs: Transaction[],
  _params: Record<string, unknown>,
  url: string,
): { summaries: TaxAisSummary[] } | TaxAisSummary | null {
  const saved = demoSavedSummary(txs)
  const taxYear = /\/tax-ais\/(\d{4}-\d{2})/.exec(url)?.[1]
  if (taxYear === undefined) return { summaries: saved ? [saved] : [] }
  return saved?.tax_year === taxYear ? saved : null
}
