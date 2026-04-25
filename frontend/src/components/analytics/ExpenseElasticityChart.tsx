import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { computeElasticity } from '@/lib/elasticityCalculator'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import StandardBarChart from '@/components/analytics/StandardBarChart'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

function getElasticityColor(e: number): string {
  if (e > 1.5) return rawColors.app.red
  if (e > 1.1) return rawColors.app.orange
  if (e > 0.9) return rawColors.app.yellow
  return rawColors.app.green
}

function getClassLabel(c: string): string {
  if (c === 'elastic') return 'Luxury'
  if (c === 'inelastic') return 'Necessity'
  return 'Proportional'
}

export default function ExpenseElasticityChart() {
  const { data: transactions = [] } = useTransactions()

  const results = useMemo(() => computeElasticity(transactions), [transactions])

  const chartData = useMemo(() =>
    results.map((r) => ({
      name: r.category.length > 14 ? `${r.category.substring(0, 12)}..` : r.category,
      elasticity: r.elasticity,
      fullName: r.category,
      avgMonthly: r.avgMonthly,
      rSquared: r.rSquared,
      classification: r.classification,
    })),
  [results])

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-5 h-5 text-app-yellow" />
        <h3 className="text-lg font-semibold text-white">Expense Elasticity</h3>
      </div>

      <p className="text-xs text-text-tertiary mb-4">
        How each category responds to income changes (elasticity &gt; 1 = luxury, &lt; 1 = necessity)
      </p>

      {results.length === 0 ? (
        <ChartEmptyState height={280} message="Need at least 6 months of income and expense data" />
      ) : (
        <>
          <StandardBarChart
            data={chartData}
            layout="vertical"
            height={300}
            xDomain={[0, 'auto']}
            xTickFormatter={(v) => (v as number).toFixed(1)}
            yCategoryKey="name"
            yWidth={120}
            tooltipValueWithPayload={(value, payload) => [
              `${value.toFixed(2)} (${getClassLabel((payload.classification as string) ?? '')}) -- Avg: ${formatCurrency((payload.avgMonthly as number) ?? 0)}/mo, R2: ${(payload.rSquared as number) ?? 0}`,
              (payload.fullName as string) ?? '',
            ]}
            referenceLines={[
              { x: 1, color: rawColors.text.tertiary, label: 'Unit' },
            ]}
            margin={{ right: 20, left: 10 }}
            hideHorizontalGrid
            bars={[
              {
                key: 'elasticity',
                color: rawColors.app.yellow,
                radius: [0, 4, 4, 0],
                barSize: 18,
                getCellColor: (row) => getElasticityColor((row.elasticity as number) ?? 0),
              },
            ]}
            showLegend={false}
          />

          {/* Summary badges */}
          <div className="mt-4 flex flex-wrap gap-2">
            {results.map((r) => (
              <span
                key={r.category}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: `${getElasticityColor(r.elasticity)}15`,
                  color: getElasticityColor(r.elasticity),
                }}
              >
                {r.category}: {r.elasticity.toFixed(2)} ({getClassLabel(r.classification)})
              </span>
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}
