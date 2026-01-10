"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { InsightsNav } from "@/components/insights/InsightsNav";
import { Card, CardContent } from "@/components/ui/card";
import { getWrapped } from "@/lib/api";
import type { WrappedData } from "@/lib/insights";

export default function WrappedPage() {
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const wrapped = await getWrapped();
        setData(wrapped);
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
                Your Financial Wrapped
              </h1>
              <p className="text-white/60">
                A story of your money journey
              </p>
            </div>
          </div>
          <InsightsNav />
          <div className="text-white/60 text-center py-12">
            Loading your story...
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
                Your Financial Wrapped
              </h1>
              <p className="text-white/60">
                A story of your money journey
              </p>
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center space-x-2">
              <Sparkles className="w-8 h-8" />
              <span>Your Financial Wrapped</span>
            </h1>
            <p className="text-white/60">
              A story of your money journey
            </p>
          </div>
        </div>

        <InsightsNav />

        {/* Wrapped Insights */}
        <div className="space-y-6">
          {data.insights.map((insight, index) => (
            <Card
              key={index}
              className="bg-white/5 border-white/10 backdrop-blur-xl hover:bg-white/10 transition-all duration-300"
            >
              <CardContent className="p-8">
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold">
                      {index + 1}
                    </div>
                    <h3 className="text-lg font-semibold text-white">
                      {insight.title}
                    </h3>
                  </div>
                  <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 pl-11">
                    {insight.value}
                  </p>
                  <p className="text-white/70 pl-11 leading-relaxed">
                    {insight.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer Message */}
        <Card className="mt-8 bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30 backdrop-blur-xl">
          <CardContent className="p-8 text-center">
            <Sparkles className="w-12 h-12 text-purple-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">
              That&rsquo;s Your Story
            </h3>
            <p className="text-white/70 max-w-2xl mx-auto">
              Every transaction tells a part of your financial journey. These
              insights help you understand your relationship with money better.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
