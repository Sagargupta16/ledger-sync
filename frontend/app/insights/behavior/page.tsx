"use client";

import { useEffect, useState } from "react";
import { Activity, ShoppingCart, TrendingUp, Zap } from "lucide-react";
import { InsightsNav } from "@/components/insights/InsightsNav";
import { StatCard } from "@/components/insights/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBehavior } from "@/lib/api";
import {
  formatCurrency,
  getLifestyleInflationText,
  type BehaviorData,
} from "@/lib/insights";

export default function BehaviorPage() {
  const [data, setData] = useState<BehaviorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const behavior = await getBehavior();
        setData(behavior);
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
              <h1 className="text-4xl font-bold text-white mb-2">
                Spending Behavior
              </h1>
              <p className="text-white/60">Your spending patterns decoded</p>
            </div>
          </div>
          <InsightsNav />
          <div className="text-white/60 text-center py-12">
            Loading insights...
          </div>
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
              <h1 className="text-4xl font-bold text-white mb-2">
                Spending Behavior
              </h1>
              <p className="text-white/60">Your spending patterns decoded</p>
            </div>
          </div>
          <InsightsNav />
          <div className="text-red-400 text-center py-12">
            {error || "Failed to load data"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Spending Behavior
            </h1>
            <p className="text-white/60">Your spending patterns decoded</p>
          </div>
        </div>

        <InsightsNav />

        {/* Behavior Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Avg Transaction"
            value={formatCurrency(data.avg_transaction_size)}
            subtitle="Per expense"
            icon={ShoppingCart}
          />
          <StatCard
            title="Spending Frequency"
            value={`${data.spending_frequency.toFixed(1)}`}
            subtitle="Transactions per month"
            icon={Activity}
          />
          <StatCard
            title="Convenience Spending"
            value={`${data.convenience_spending_pct.toFixed(1)}%`}
            subtitle="Shopping, food, entertainment"
            icon={Zap}
          />
          <StatCard
            title="Lifestyle Inflation"
            value={`${data.lifestyle_inflation > 0 ? "+" : ""}${data.lifestyle_inflation.toFixed(1)}%`}
            subtitle={getLifestyleInflationText(data.lifestyle_inflation)}
            icon={TrendingUp}
            trend={{
              value: `${Math.abs(data.lifestyle_inflation).toFixed(1)}%`,
              positive: data.lifestyle_inflation < 0,
            }}
          />
        </div>

        {/* Explanations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white text-lg">
                What is Convenience Spending?
              </CardTitle>
            </CardHeader>
            <CardContent className="text-white/60 text-sm space-y-2">
              <p>
                Convenience spending represents expenses on shopping,
                entertainment, dining, and other discretionary categories.
              </p>
              <p>
                You spent{" "}
                <span className="text-white font-medium">
                  {data.convenience_spending_pct.toFixed(1)}%
                </span>{" "}
                of your money on these categories.
              </p>
              <p className="text-white/40 text-xs pt-2">
                High convenience spending isn&rsquo;t bad—it reflects your priorities
                and lifestyle choices.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white text-lg">
                Understanding Lifestyle Inflation
              </CardTitle>
            </CardHeader>
            <CardContent className="text-white/60 text-sm space-y-2">
              <p>
                Lifestyle inflation measures how your average spending has
                changed over time.
              </p>
              <p>
                Your spending has{" "}
                <span
                  className={`font-medium ${
                    data.lifestyle_inflation > 0
                      ? "text-yellow-400"
                      : "text-green-400"
                  }`}
                >
                  {data.lifestyle_inflation > 0 ? "increased" : "decreased"}
                </span>{" "}
                by {Math.abs(data.lifestyle_inflation).toFixed(1)}% compared to
                your early months.
              </p>
              <p className="text-white/40 text-xs pt-2">
                {getLifestyleInflationText(data.lifestyle_inflation)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Top Categories */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Top Spending Categories</CardTitle>
            <p className="text-white/60 text-sm">
              Where your money actually goes
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.top_categories.map((category, index) => {
                const maxAmount = Math.max(
                  ...data.top_categories.map((c) => c.amount)
                );
                const percentage = (category.amount / maxAmount) * 100;

                return (
                  <div key={category.category} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-3">
                        <span className="text-white/40 text-xs font-mono w-6">
                          #{index + 1}
                        </span>
                        <span className="text-white text-sm">
                          {category.category}
                        </span>
                      </div>
                      <span className="text-white/80 text-sm font-medium">
                        {formatCurrency(category.amount)}
                      </span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
