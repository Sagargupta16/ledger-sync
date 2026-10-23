/**
 * "Rate mix" panel of the GST page: a donut of estimated GST by slab above a
 * list of the slabs. The slices sweep in when the panel scrolls into view;
 * hovering a slice or a list row lifts that slab, dims the rest and swaps the
 * centre from the total to that slab's amount and share.
 */

import { useMemo, useState } from 'react'
import { motion } from 'motion/react'

import PieCenterReadout from '@/components/analytics/PieCenterReadout'
import PieChart from '@/components/charts/PieChart'
import ProgressBar from '@/components/shared/ProgressBar'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { fadeUpItem } from '@/constants/animations'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import type { GSTSlabBreakdown } from '@/lib/gstCalculator'
import { useThemeStore } from '@/store/themeStore'

import { gstSlabColor, gstSlabCssColor } from '../constants'

/** The ring this donut has always drawn: a 66px hole in a 90px rim, with 2 degree gaps. */
const HOLE_RATIO = 66 / 90
const PAD_ANGLE = (2 * Math.PI) / 180

interface Props {
  readonly totalGST: number
  readonly taxableSlabs: readonly GSTSlabBreakdown[]
}

export default function GSTRateMix({ totalGST, taxableSlabs }: Props) {
  const theme = useThemeStore((state) => state.resolved)
  // One hover state for the slices and the list rows, keyed by slab rate.
  const [activeKey, setActiveKey] = useState<string | null>(null)
  // gstSlabColor resolves when called, so the memo is keyed by the theme (and
  // carries it, which makes it a real input): a toggle re-resolves every slice.
  const slices = useMemo(
    () => ({
      theme,
      rows: taxableSlabs.map((slab) => ({
        key: String(slab.slab),
        label: `${slab.slab}% slab`,
        value: slab.gstAmount,
        color: gstSlabColor(slab.slab),
      })),
    }),
    [taxableSlabs, theme],
  ).rows
  const share = (amount: number) => (totalGST > 0 ? (amount / totalGST) * 100 : 0)
  const active = taxableSlabs.find((slab) => String(slab.slab) === activeKey)

  return (
    <motion.div variants={fadeUpItem} className="ledger-panel relative min-w-0 p-4 sm:p-6">
      <div className="mb-2">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">01 / Rate mix</p>
        <h3 className="text-xl font-semibold tracking-tight text-foreground">Estimated GST by slab</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Share of estimated GST across applied tax rates
        </p>
      </div>
      <PieChart
        data={slices}
        innerRadius={HOLE_RATIO}
        padAngle={PAD_ANGLE}
        activeKey={activeKey}
        onActiveChange={setActiveKey}
        height={240}
        ariaLabel="Estimated GST paid split by tax slab rate"
        centerLabel={active ? (
          <PieCenterReadout
            eyebrow={`${active.slab}% slab`}
            value={formatCurrency(active.gstAmount)}
            caption={`${formatPercent(share(active.gstAmount), false, 0)} of GST`}
          />
        ) : (
          <PieCenterReadout value={formatCurrencyShort(totalGST)} caption="Estimated GST" />
        )}
      />
      <ul aria-label="GST by tax rate" className="divide-y divide-border/60 border-t border-border">
        {taxableSlabs.map((slab) => {
          const slabShare = share(slab.gstAmount)
          return (
            <li
              key={slab.slab}
              className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 py-3"
              onMouseEnter={() => setActiveKey(String(slab.slab))}
              onMouseLeave={() => setActiveKey(null)}
            >
              <span className="font-mono text-xs font-semibold tabular-nums text-foreground">{slab.slab}%</span>
              <div className="min-w-0">
                <ProgressBar
                  value={slabShare}
                  color={gstSlabCssColor(slab.slab)}
                  height={6}
                  ariaLabel={`${slab.slab}% slab, share of estimated GST`}
                />
              </div>
              <span className="text-right">
                <span className="block font-mono text-xs font-semibold tabular-nums text-foreground">{formatCurrency(slab.gstAmount)}</span>
                <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-muted-foreground">{formatPercent(slabShare, false, 0)} of GST</span>
              </span>
            </li>
          )
        })}
      </ul>
      {chartDataTable(
        taxableSlabs,
        [
          { header: 'Tax slab', rowHeader: true, value: (row) => `${row.slab}%` },
          { header: 'Estimated GST', value: (row) => formatCurrency(row.gstAmount) },
          { header: 'Share of GST', value: (row) => formatPercent(share(row.gstAmount), false, 0) },
        ],
        'Estimated GST by tax slab: exact amounts',
        (row) => String(row.slab),
      )}
    </motion.div>
  )
}
