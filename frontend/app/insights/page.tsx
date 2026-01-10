"use client";

import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, PiggyBank, TrendingUp } from "lucide-react";
import { InsightsNav } from "@/components/insights/InsightsNav";
import { StatCard } from "@/components/insights/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOverview } from "@/lib/api";
import { formatCurrency, formatMonth, type OverviewData } from "@/lib/insights";

export default function InsightsPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const overview = await getOverview();
        setData(overview);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Financial Insights</h1>
              <p className="text-white/60">Understanding your money story</p>
            </div>
          </div>
          <InsightsNav />
          <div className="text-white/60 text-center py-12">Loading insights...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Financial Insights</h1>
              <p className="text-white/60">Understanding your money story</p>
            </div>
          </div>
          <InsightsNav />
          <div className="text-red-400 text-center py-12">{error || "Failed to load data"}</div>
        </div>
      </div>
    );
  }

  const savingsRate = data.total_income > 0 
    ? ((data.net_change / data.total_income) * 100).toFixed(1)
    : "0";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Financial Insights</h1>
            <p className="text-white/60">Understanding your money story</p>
          </div>
        </div>

        <InsightsNav />

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Income"
            value={formatCurrency(data.total_income)}
            subtitle={`${data.transaction_count} transactions`}
            icon={ArrowUpCircle}
          />
          <StatCard
            title="Real Spend"
            value={formatCurrency(data.total_expenses)}
            subtitle="Expenses only"
            icon={ArrowDownCircle}
          />
          <StatCard
            title="Net Change"
            value={formatCurrency(data.net_change)}
            subtitle={`${savingsRate}% savings rate`}
            icon={TrendingUp}
            trend={{
              value: savingsRate + "%",
              positive: data.net_change > 0,
            }}
          />
          <StatCard
            title="Surplus Rate"
            value={`${savingsRate}%`}
            subtitle={data.net_change > 0 ? "Saving" : "Deficit"}
            icon={PiggyBank}
          />
        </div>

        {/* Best and Worst Months */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {data.best_month && (
            <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <span>🎉</span>
                  <span>Best Month</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-2xl font-bold text-green-400">
                    {formatMonth(data.best_month.month)}
                  </p>
                  <p className="text-white/60 text-sm">
                    Surplus: {formatCurrency(data.best_month.surplus)}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Income</span>
                    <span className="text-white">
                      {formatCurrency(data.best_month.income)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Expenses</span>
                    <span className="text-white">
                      {formatCurrency(data.best_month.expenses)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {data.worst_month && (
            <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <span>📉</span>
                  <span>Challenging Month</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-2xl font-bold text-red-400">
                    {formatMonth(data.worst_month.month)}
                  </p>
                  <p className="text-white/60 text-sm">
                    Surplus: {formatCurrency(data.worst_month.surplus)}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Income</span>
                    <span className="text-white">
                      {formatCurrency(data.worst_month.income)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Expenses</span>
                    <span className="text-white">
                      {formatCurrency(data.worst_month.expenses)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Account Activity */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Account Activity</CardTitle>
            <p className="text-white/60 text-sm">
              Total transaction volume by account
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.asset_allocation.slice(0, 8).map((account) => (
                <div key={account.account} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white text-sm">{account.account}</span>
                    <span className="text-white/80 text-sm font-medium">
                      {formatCurrency(account.balance)}
                    </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500/50"
                      style={{
                        width: `${Math.min(
                          100,
                          (account.balance /
                            Math.max(
                              ...data.asset_allocation.map((a) => a.balance)
                            )) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
