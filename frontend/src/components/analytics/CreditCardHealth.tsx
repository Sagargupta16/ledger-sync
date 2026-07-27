import { useMemo } from 'react'

import { motion } from 'motion/react'
import { CreditCard, AlertTriangle, CheckCircle, CircleHelp, Info } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import EmptyState from '@/components/shared/EmptyState'
import ProgressBar from '@/components/shared/ProgressBar'
import { Money } from '@/components/ui'
import { hexToRgba, rawColors } from '@/constants/colors'
import { ROUTES } from '@/constants'
import { useAccountBalances } from '@/hooks/api/useAnalytics'
import type { AccountTypeValue } from '@/services/api/accountClassifications'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { usePreferencesStore, selectCreditCardLimits } from '@/store/preferencesStore'

// Typed against the wire vocabulary rather than a bare string, so a typo or a
// rename of the backend enum value fails type-check here instead of silently
// matching no account and reporting zero credit cards.
const CREDIT_CARD_TYPE: AccountTypeValue = 'Credit Cards'

// Where a user actually sets a limit. Referenced in every "no limit" message so
// the empty state is actionable instead of just apologetic.
const LIMITS_LOCATION = 'Settings > Advanced > Credit Card Limits'

interface CardBase {
  readonly name: string
  /** null when the API balance is not a finite number -- nothing is knowable. */
  readonly balance: number | null
}

/** Positive user-configured limit and a real balance, so every ratio is a number. */
interface MeasuredCard extends CardBase {
  readonly balance: number
  readonly creditLimit: number
  readonly utilization: number
  readonly status: 'low' | 'medium' | 'high' | 'critical'
}

/** No usable limit (or no usable balance). At most the outstanding is knowable. */
interface UnmeasuredCard extends CardBase {
  readonly creditLimit: number | null
  readonly utilization: null
  readonly status: 'unknown'
}

type CreditCardAccount = MeasuredCard | UnmeasuredCard

// Recommended utilization ceiling -- credit bureaus flag scores above 30%.
const UTILIZATION_TARGET = 30

// Bullet-graph background zones: low-alpha qualitative ranges (green < 30,
// blue 30-50, yellow 50-75, red > 75) so a bar reads "where do I sit" even
// before the fill is interpreted. Tokens only, never raw hex.
const UTILIZATION_BANDS = [
  { upTo: 30, color: hexToRgba(rawColors.app.green, 0.18) },
  { upTo: 50, color: hexToRgba(rawColors.app.blue, 0.18) },
  { upTo: 75, color: hexToRgba(rawColors.app.yellow, 0.18) },
  { upTo: 100, color: hexToRgba(rawColors.app.red, 0.18) },
] as const

const STATUS_CLASS: Record<CreditCardAccount['status'], string> = {
  low: 'text-app-green bg-app-green/20 border-app-green/30',
  medium: 'text-app-blue bg-app-blue/20 border-app-blue/30',
  high: 'text-app-yellow bg-app-yellow/20 border-app-yellow/30',
  critical: 'text-app-red bg-app-red/20 border-app-red/30',
  unknown: 'text-foreground bg-[var(--overlay-2)] border-[var(--hairline-2)]',
}

const UTILIZATION_LEGEND = [
  { range: '<30%', label: 'Excellent', bg: 'bg-app-green/10', text: 'text-app-green' },
  { range: '30-50%', label: 'Good', bg: 'bg-app-yellow/10', text: 'text-app-yellow' },
  { range: '>50%', label: 'Reduce', bg: 'bg-app-red/10', text: 'text-app-red' },
] as const

const LINK_CLASS =
  'inline-flex min-h-11 items-center font-medium text-app-blue underline underline-offset-2 hover:text-app-blue-vibrant focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:min-h-0'

/** Solid fill color matching the utilization tier. */
function utilizationFill(utilization: number): string {
  if (utilization > 75) return rawColors.app.red
  if (utilization > 50) return rawColors.app.yellow
  if (utilization > 30) return rawColors.app.blue
  return rawColors.app.green
}

/**
 * A limit the user never set is NOT 100000.
 *
 * This used to be `creditCardLimits[name] || 100000`, inventing a limit per
 * unconfigured card and dividing real balances by the invention. On the live
 * ledger (7 detected cards, 5 with a configured limit) that fabricated a
 * 12,40,000 denominator where only 10,40,000 exists. `||` also swallowed a
 * deliberate 0 (closed or blocked card), which `??` semantics preserve --
 * though utilization stays suppressed for it, 0 being no denominator either.
 */
function resolveLimit(configured: number | undefined): number | null {
  if (configured === undefined || !Number.isFinite(configured) || configured < 0) return null
  return configured
}

/**
 * A non-finite balance is refused as a numerator for the same reason a missing
 * limit is refused as a denominator. Validating only the limit let a NaN balance
 * yield `utilization === NaN`, which is `!== null` and so counted as measured --
 * NaN then spread into every aggregate and the header read "NaN% utilization".
 */
function buildCard(name: string, rawBalance: number, limit: number | null): CreditCardAccount {
  const balance = Number.isFinite(rawBalance) ? Math.abs(rawBalance) : null

  if (balance === null || limit === null || limit <= 0) {
    return { name, balance, creditLimit: limit, utilization: null, status: 'unknown' }
  }

  const utilization = (balance / limit) * 100
  let status: MeasuredCard['status'] = 'low'
  if (utilization > 75) status = 'critical'
  else if (utilization > 50) status = 'high'
  else if (utilization > 30) status = 'medium'

  return { name, balance, creditLimit: limit, utilization, status }
}

function countLabel(n: number): string {
  return `${n} ${n === 1 ? 'card' : 'cards'}`
}

/** Counts of the distinct reasons a card cannot be rated. */
interface Gap {
  readonly noLimit: number
  readonly zeroLimit: number
  readonly unavailable: number
}

/**
 * Why no percentage exists, in the user's terms. "no limits set" was printed even
 * when the user HAD set a limit of 0, contradicting the per-card row right below
 * it and sending them to settings to redo work already done, so each reason is
 * counted separately and only the ones that occur are named.
 */
function gapReason({ noLimit, zeroLimit, unavailable }: Gap): string {
  const parts: string[] = []
  if (noLimit > 0) {
    parts.push(noLimit === 1 ? 'one card has no limit set' : `${noLimit} cards have no limit set`)
  }
  if (zeroLimit > 0) {
    parts.push(zeroLimit === 1 ? 'one limit is set to 0' : `${zeroLimit} limits are set to 0`)
  }
  if (unavailable > 0) {
    parts.push(
      unavailable === 1 ? 'one balance is unavailable' : `${unavailable} balances are unavailable`,
    )
  }
  return parts.join(' and ')
}

/** The only call to action that is true for the gap at hand. Empty when none is. */
function gapAction(gap: Gap): string {
  if (gap.noLimit > 0) return `Add limits in ${LIMITS_LOCATION}.`
  if (gap.zeroLimit > 0) return `Raise a limit above 0 in ${LIMITS_LOCATION} to see utilization.`
  return ''
}

function emptyStateDescription(cardCountLabel: string, gap: Gap): string {
  const head = `Outstanding balances below are exact, but ${gapReason(gap)}, so any utilization across ${cardCountLabel} would be invented rather than measured.`
  const action = gapAction(gap)
  return action ? `${head} ${action}` : head
}

function StatusIcon({ status }: Readonly<{ status: CreditCardAccount['status'] }>) {
  if (status === 'unknown') return <CircleHelp className="w-4 h-4 text-muted-foreground shrink-0" />
  if (status === 'high' || status === 'critical') return <AlertTriangle className="w-4 h-4 shrink-0" />
  return <CheckCircle className="w-4 h-4 shrink-0" />
}

function utilizationBar(utilization: number, ariaLabel: string) {
  return (
    <ProgressBar
      value={Math.min(100, utilization)}
      color={utilizationFill(utilization)}
      height={8}
      target={UTILIZATION_TARGET}
      bands={UTILIZATION_BANDS}
      ariaLabel={ariaLabel}
    />
  )
}

/** Label plus amount. `<Money>` keeps the digits from truncating in the flex row. */
function AmountRow({ label, value }: Readonly<{ label: string; value: number | null }>) {
  return (
    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="min-w-0 truncate">{label}</span>
      {value === null ? (
        <span className="shrink-0 whitespace-nowrap font-medium">Unavailable</span>
      ) : (
        <Money value={value} className="text-xs" />
      )}
    </div>
  )
}

/** Short badge for the reason a percentage is missing, so the row explains itself. */
function unmeasuredBadge(card: UnmeasuredCard): string {
  if (card.balance === null) return 'Balance unavailable'
  return card.creditLimit === 0 ? 'Limit is 0' : 'No limit set'
}

function unmeasuredReason(card: UnmeasuredCard): string {
  if (card.balance === null) {
    return 'This balance did not come back as a number, so nothing is computed from it.'
  }
  return card.creditLimit === 0
    ? 'Limit is set to 0, so there is no headroom to measure.'
    : 'Utilization and available credit stay hidden until you set this limit.'
}

function CardRow({ card }: Readonly<{ card: CreditCardAccount }>) {
  const label = card.name.replace(' Credit Card', '')

  return (
    <div className={`p-4 rounded-xl border ${STATUS_CLASS[card.status]}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon status={card.status} />
          <span className="font-medium text-sm truncate" title={label}>
            {label}
          </span>
        </div>
        {card.utilization === null ? (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {unmeasuredBadge(card)}
          </span>
        ) : (
          <span className="shrink-0 font-bold tabular-nums">{formatPercent(card.utilization)}</span>
        )}
      </div>

      {card.utilization !== null &&
        utilizationBar(
          card.utilization,
          `${label} utilization ${formatPercent(card.utilization)}, target under 30%`,
        )}

      <AmountRow label="Outstanding" value={card.balance} />

      {card.utilization === null ? (
        <p className="mt-1 text-xs text-muted-foreground">{unmeasuredReason(card)}</p>
      ) : (
        <AmountRow
          label={`Available of ${formatCurrency(card.creditLimit)}`}
          value={Math.max(0, card.creditLimit - card.balance)}
        />
      )}
    </div>
  )
}

export default function CreditCardHealth() {
  const { data: balanceData, isLoading: isBalanceLoading } = useAccountBalances()
  const creditCardLimits = usePreferencesStore(selectCreditCardLimits)

  // Primary classification source: user-maintained account types from
  // Settings -> Accounts. Previously this component only looked for the
  // literal word "credit" in the account name -- cards named "HDFC Millennia"
  // or "Amazon Pay Card" were silently dropped.
  const { data: classifications, isLoading: isClassifyLoading } = useQuery({
    queryKey: ['account-classifications'],
    queryFn: () => accountClassificationsService.getAllClassifications(),
    staleTime: Infinity,
  })

  const isLoading = isBalanceLoading || isClassifyLoading

  const creditCards = useMemo((): CreditCardAccount[] => {
    if (!balanceData?.accounts) return []

    const cards: CreditCardAccount[] = []

    Object.entries(balanceData.accounts).forEach(([name, data]) => {
      // Prefer the user's explicit classification. Fall back to the old name
      // match only when the account hasn't been classified yet -- so users
      // who haven't visited Settings > Accounts still see their cards.
      const classifiedType = classifications?.[name]
      const isClassifiedCreditCard = classifiedType === CREDIT_CARD_TYPE
      const isNameHintedCreditCard = !classifiedType && name.toLowerCase().includes('credit')

      if (isClassifiedCreditCard || isNameHintedCreditCard) {
        cards.push(buildCard(name, data.balance, resolveLimit(creditCardLimits[name])))
      }
    })

    // Rateable cards first, then unmeasured ones by balance so the biggest
    // unmeasured exposure is still near the top.
    return cards.sort((a, b) => {
      if (a.utilization === null && b.utilization === null) return (b.balance ?? -1) - (a.balance ?? -1)
      if (a.utilization === null) return 1
      if (b.utilization === null) return -1
      return b.utilization - a.utilization
    })
  }, [balanceData, creditCardLimits, classifications])

  // Every aggregate needing a denominator is computed over measured cards only,
  // and the coverage is always disclosed next to the number.
  const measured = creditCards.filter((c): c is MeasuredCard => c.utilization !== null)
  const unmeasured = creditCards.filter((c) => c.utilization === null)
  const unmeasuredCount = unmeasured.length
  // A limit of 0 WAS configured -- it is just unusable as a denominator. Copy has
  // to distinguish that from "never set", or it tells the user to do a thing
  // they already did.
  const gap: Gap = {
    noLimit: unmeasured.filter((c) => c.balance !== null && c.creditLimit === null).length,
    zeroLimit: unmeasured.filter((c) => c.balance !== null && c.creditLimit === 0).length,
    unavailable: unmeasured.filter((c) => c.balance === null).length,
  }
  const totalBalance = creditCards.reduce((sum, c) => sum + (c.balance ?? 0), 0)
  const measuredBalance = measured.reduce((sum, c) => sum + c.balance, 0)
  const measuredLimit = measured.reduce((sum, c) => sum + c.creditLimit, 0)
  const overallUtilization = measuredLimit > 0 ? (measuredBalance / measuredLimit) * 100 : null
  const isElevated = overallUtilization !== null && overallUtilization > 50

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-border p-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (creditCards.length === 0) {
    return (
      <div className="glass rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-app-purple/20 rounded-xl">
            <CreditCard className="w-6 h-6 text-app-purple" />
          </div>
          <h3 className="text-lg font-semibold">Credit Card Health</h3>
        </div>
        <p className="text-muted-foreground">No credit card accounts found in your transactions.</p>
      </div>
    )
  }

  // Static class pairs -- Tailwind cannot scan an interpolated class name.
  const headerTone =
    overallUtilization === null
      ? { bg: 'bg-app-purple/20', text: 'text-app-purple' }
      : isElevated
        ? { bg: 'bg-app-yellow/20', text: 'text-app-yellow' }
        : { bg: 'bg-app-green/20', text: 'text-app-green' }

  const cardCountLabel = countLabel(creditCards.length)
  // The denominator's provenance travels with the number everywhere it appears.
  const coverage = `${measured.length} of ${creditCards.length} cards with limits set`
  const coverageLabel =
    overallUtilization === null
      ? `utilization unavailable, ${gapReason(gap)}`
      : `${formatPercent(overallUtilization)} utilization across ${coverage}`
  // Only offer "go set a limit" when a limit is actually absent. When every
  // unmeasured card carries a deliberate 0, the setting is already done.
  const limitsAction = gapAction(gap)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        {/* Purple, not green: an unrateable card set is neither healthy nor not. */}
        <div className={`p-3 rounded-xl ${headerTone.bg}`}>
          <CreditCard className={`w-6 h-6 ${headerTone.text}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">Credit Card Health</h3>
          <p className="text-sm text-muted-foreground">
            {cardCountLabel} &bull; {coverageLabel}
          </p>
        </div>
      </div>

      {/* Overall utilization -- suppressed entirely when no limit is known */}
      <div className="mb-6 p-4 rounded-xl bg-background/30 border border-border">
        {overallUtilization === null ? (
          <EmptyState
            icon={CircleHelp}
            title={
              gap.noLimit > 0
                ? 'Utilization needs your credit limits'
                : 'Utilization needs a limit above 0'
            }
            description={emptyStateDescription(cardCountLabel, gap)}
            actionLabel={limitsAction ? 'Open credit card limits' : undefined}
            actionHref={limitsAction ? ROUTES.SETTINGS : undefined}
            variant="compact"
          />
        ) : (
          <>
            <div className="flex justify-between items-center gap-3 mb-2">
              <span className="text-sm font-medium">Credit utilization</span>
              <span className={`font-bold tabular-nums ${isElevated ? 'text-app-yellow' : 'text-app-green'}`}>
                {formatPercent(overallUtilization)}
              </span>
            </div>
            {utilizationBar(
              overallUtilization,
              `Credit utilization ${formatPercent(overallUtilization)} across ${coverage}, target under 30%`,
            )}
            {/* Scoped to the measured cards, so the ratio above is auditable
                from its own numerator and denominator. */}
            {unmeasuredCount > 0 && (
              <AmountRow
                label={`Outstanding on ${countLabel(measured.length)} with limits`}
                value={measuredBalance}
              />
            )}
            <AmountRow label="Limits you have set" value={measuredLimit} />
          </>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--hairline-1)] pt-3">
          <span className="min-w-0 text-sm font-medium">
            {gap.unavailable > 0
              ? `Total outstanding, ${creditCards.length - gap.unavailable} of ${cardCountLabel}`
              : `Total outstanding, all ${cardCountLabel}`}
          </span>
          <Money value={totalBalance} bold />
        </div>
      </div>

      {/* Individual Cards */}
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {creditCards.map((card) => (
          <CardRow key={card.name} card={card} />
        ))}
      </div>

      {/* Coverage gap -- only when there is a measured ratio to qualify */}
      {measured.length > 0 && unmeasuredCount > 0 && (
        <output className="mt-4 flex items-start gap-2.5 rounded-xl border border-app-blue/20 bg-app-blue/10 px-3 py-2.5 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-app-blue" aria-hidden />
          <p className="min-w-0 text-foreground">
            {unmeasuredCount} of {creditCards.length} cannot be rated: {gapReason(gap)}. Those balances
            are in the total above but out of every ratio, because guessing a limit would fake the
            percentage.{' '}
            {limitsAction && (
              <Link to={ROUTES.SETTINGS} className={LINK_CLASS}>
                Fix this in {LIMITS_LOCATION}
              </Link>
            )}
          </p>
        </output>
      )}

      {/* Recommendations */}
      {measured.some((c) => c.status === 'critical' || c.status === 'high') && (
        <div className="mt-4 p-4 rounded-xl bg-app-yellow/10 border border-app-yellow/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-app-yellow flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-app-yellow">High Utilization Warning</p>
              <p className="text-xs text-muted-foreground mt-1">
                Credit utilization above 30% can affect your credit score. Consider paying down balances
                on high-utilization cards.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tips -- three cells crowd below ~360px, so wrap to 2-up on phones. */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 text-center">
        {UTILIZATION_LEGEND.map((tier) => (
          <div key={tier.label} className={`p-2 rounded-lg ${tier.bg}`}>
            <p className={`text-xs font-medium ${tier.text}`}>{tier.range}</p>
            <p className="text-caption text-muted-foreground">{tier.label}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
