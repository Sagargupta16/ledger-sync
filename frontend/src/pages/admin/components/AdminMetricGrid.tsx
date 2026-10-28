import { motion } from 'motion/react'
import { Bot, CalendarClock, Database, DollarSign, FileUp, Sparkles, UserPlus, Users } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import { fadeUpItem, staggerFast } from '@/constants/animations'
import type { AdminStats } from '@/services/api/admin'

import { formatCount, formatUsd } from '../adminFormat'

/**
 * Eight app-wide totals: who uses the app, how much ledger it holds, and what
 * the AI costs. Two across on a phone, four from `lg`.
 */
export default function AdminMetricGrid({ stats }: Readonly<{ stats: AdminStats }>) {
  const { users, ledger, ai } = stats
  return (
    <motion.div
      variants={staggerFast}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
    >
      <motion.div variants={fadeUpItem}>
        <MetricCard title="Accounts" value={formatCount(users.total)} icon={Users} color="blue"
          subtitle={`${formatCount(users.signed_in_30d)} signed in within 30 days`} />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard title="Signed in, 7 days" value={formatCount(users.signed_in_7d)} icon={CalendarClock}
          color="teal" titleInfo="Accounts whose last sign-in was in the past 7 days." />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard title="New, 30 days" value={formatCount(users.new_30d)} icon={UserPlus} color="green" />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard title="Transactions" value={formatCount(ledger.transactions)} icon={Database} color="indigo"
          subtitle="Live rows across every account" />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard title="Imports, 30 days" value={formatCount(ledger.imports_30d)} icon={FileUp} color="purple"
          subtitle={`${formatCount(ledger.rows_imported_30d)} rows processed`} />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard title="AI calls today" value={formatCount(ai.today.calls)} icon={Bot} color="orange"
          subtitle={`${formatCount(ai.today.tokens)} tokens, UTC day`} />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard title="AI calls, 30 days" value={formatCount(ai.last_30d.calls)} icon={Sparkles} color="yellow"
          subtitle={`${formatCount(ai.last_30d.tokens)} tokens`} />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard title="AI spend, 30 days" value={formatUsd(ai.last_30d.cost_usd)} icon={DollarSign} color="red"
          subtitle="Estimated at list prices"
          titleInfo="An estimate from recorded tokens at Bedrock and provider list prices, in US dollars. Your AWS bill is the authority." />
      </motion.div>
    </motion.div>
  )
}
