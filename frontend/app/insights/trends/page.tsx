"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { InsightsNav } from "@/components/insights/InsightsNav";
import { StatCard } from "@/components/insights/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTrends } from "@/lib/api";
import {
  formatCurrency,
  formatMonth,
  getConsistencyRating,
  type TrendsData,
} from "@/lib/insights";

export default function TrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const trends = await getTrends();
        setData(trends);
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
                Financial Trends
              </h1>
              <p className="text-white/60">Your money&rsquo;s journey over time</p>
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
                Financial Trends
              </h1>
              <p className="text-white/60">Your money&rsquo;s journey over time</p>
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

  const latestMonth = data.monthly_trends[data.monthly_trends.length - 1];
  const previousMonth =
    data.monthly_trends.length > 1
      ? data.monthly_trends[data.monthly_trends.length - 2]
      : null;

  const surplusChange = previousMonth
    ? latestMonth.surplus - previousMonth.surplus
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Financial Trends
            </h1>
            <p className="text-white/60">Your money&rsquo;s journey over time</p>
          </div>
        </div>

        <InsightsNav />

        {/* Trend Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Latest Month Surplus"
            value={formatCurrency(latestMonth.surplus)}
            subtitle={formatMonth(latestMonth.month)}
            icon={latestMonth.surplus > 0 ? TrendingUp : TrendingDown}
            trend={
              previousMonth
                ? {
                    value: formatCurrency(Math.abs(surplusChange)),
                    positive: surplusChange > 0,
                  }
                : undefined
            }
          />
          <StatCard
            title="Consistency Score"
            value={`${data.consistency_score.toFixed(0)}/100`}
            subtitle={getConsistencyRating(data.consistency_score)}
            icon={Activity}
          />
          <StatCard
            title="Months Tracked"
            value={data.monthly_trends.length.toString()}
            subtitle="Total data points"
            icon={TrendingUp}
          />
        </div>

        {/* Explanations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white text-lg">
                What is Consistency Score?
              </CardTitle>
            </CardHeader>
            <CardContent className="text-white/60 text-sm space-y-2">
              <p>
                Your consistency score measures how predictable your monthly
                expenses are.
              </p>
              <p>
                Score:{" "}
                <span className="text-white font-medium">
                  {data.consistency_score.toFixed(0)}/100
                </span>{" "}
                - {getConsistencyRating(data.consistency_score)}
              </p>
              <p className="text-white/40 text-xs pt-2">
                Higher scores mean stable, predictable spending. Lower scores
                indicate variable expenses month-to-month.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white text-lg">
                Understanding Surplus Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="text-white/60 text-sm space-y-2">
              <p>
                The surplus trend shows your income minus expenses over time.
              </p>
              <p>
                Positive values mean you&rsquo;re saving, negative values indicate
                spending more than you earn.
              </p>
              <p className="text-white/40 text-xs pt-2">
                Look for patterns: Are you consistently saving? Is there a
                seasonal trend?
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Trends Table */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Monthly Breakdown</CardTitle>
            <p className="text-white/60 text-sm">
              Income vs Expenses over time
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.monthly_trends
                .slice()
                .reverse()
                .map((month) => (
                  <div
                    key={month.month}
                    className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium">
                        {formatMonth(month.month)}
                      </p>
                      <div className="flex items-center space-x-4 mt-1">
                        <span className="text-xs text-green-400">
                          ↑ {formatCurrency(month.income)}
                        </span>
                        <span className="text-xs text-red-400">
                          ↓ {formatCurrency(month.expenses)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-lg font-bold ${
                          month.surplus > 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {month.surplus > 0 ? "+" : ""}
                        {formatCurrency(month.surplus)}
                      </p>
                      <p className="text-xs text-white/40">surplus</p>
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
