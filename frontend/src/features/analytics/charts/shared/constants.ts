/**
 * Chart Constants - Shared values across all charts
 */

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const CHART_COLORS = [
  "#ec4899", // pink
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // purple
] as const;

export const VIEW_MODES = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "decade", label: "Decade" },
] as const;
