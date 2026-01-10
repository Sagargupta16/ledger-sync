"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrendingUp, Activity, BarChart3, Sparkles, ArrowLeft } from "lucide-react";

const navItems = [
  {
    name: "Overview",
    href: "/insights",
    icon: BarChart3,
  },
  {
    name: "Behavior",
    href: "/insights/behavior",
    icon: Activity,
  },
  {
    name: "Trends",
    href: "/insights/trends",
    icon: TrendingUp,
  },
  {
    name: "Wrapped",
    href: "/insights/wrapped",
    icon: Sparkles,
  },
];

export function InsightsNav() {
  const pathname = usePathname();

  return (
    <div className="mb-8">
      {/* Back to Home */}
      <Link
        href="/"
        className="inline-flex items-center space-x-2 text-white/60 hover:text-white text-sm mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Upload</span>
      </Link>

      {/* Navigation Tabs */}
      <nav className="flex space-x-1 border-b border-white/10">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                isActive
                  ? "border-white text-white"
                  : "border-transparent text-white/60 hover:text-white/80"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
