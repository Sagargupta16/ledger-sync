/**
 * Chart Helper Functions
 * Shared utilities for chart data processing and configuration
 */

import { truncateLabel } from "../../../lib/formatters";

export { truncateLabel };

export const commonChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: "#9ca3af",
      },
    },
  },
  scales: {
    x: {
      ticks: { color: "#9ca3af" },
      grid: { color: "#374151" },
    },
    y: {
      ticks: { color: "#9ca3af" },
      grid: { color: "#374151" },
    },
  },
};

export const doughnutOptions = {
  ...commonChartOptions,
  scales: {},
};

/**
 * Aggregate data by month, keeping the latest entry for each month
 */
export const aggregateByMonth = <T extends { date: string }>(data: ReadonlyArray<T>): T[] => {
  const monthlyData: Record<string, T> = {};
  data.forEach((item) => {
    const monthKey = item.date.substring(0, 7);
    if (!monthlyData[monthKey] || new Date(item.date) > new Date(monthlyData[monthKey].date)) {
      monthlyData[monthKey] = item;
    }
  });
  return Object.values(monthlyData).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
};

/**
 * Build cumulative data points for time series
 */
export const buildCumulativeDataPoints = (
  labels: ReadonlyArray<unknown>,
  getData: (labelIndex: number, item: string) => number,
  item: string,
  cumulativeData: Record<string, number>
) => {
  return labels.map((_, labelIndex) => {
    cumulativeData[item] += getData(labelIndex, item);
    return cumulativeData[item];
  });
};

/**
 * Build regular (non-cumulative) data points
 */
export const buildRegularDataPoints = (
  labels: ReadonlyArray<unknown>,
  getData: (labelIndex: number, item: string) => number,
  item: string
) => {
  return labels.map((_, labelIndex) => getData(labelIndex, item));
};

/**
 * Create dataset objects for charts with proper styling
 */
export const createDatasets = (
  items: string[],
  getData: (labelIndex: number, item: string) => number,
  labels: ReadonlyArray<unknown>,
  colors: string[],
  dataMode: "cumulative" | "regular",
  labelTruncate: number | null = null
) => {
  if (dataMode === "cumulative") {
    const cumulativeData: Record<string, number> = {};
    items.forEach((item) => {
      cumulativeData[item] = 0;
    });

    return items.map((item, index) => ({
      label: labelTruncate ? truncateLabel(item, labelTruncate) : item,
      data: buildCumulativeDataPoints(labels, getData, item, cumulativeData),
      borderColor: colors[index % colors.length],
      backgroundColor: `${colors[index % colors.length]}20`,
      tension: 0.4,
      fill: false,
    }));
  }

  return items.map((item, index) => ({
    label: labelTruncate ? truncateLabel(item, labelTruncate) : item,
    data: buildRegularDataPoints(labels, getData, item),
    borderColor: colors[index % colors.length],
    backgroundColor: `${colors[index % colors.length]}20`,
    tension: 0.4,
    fill: false,
  }));
};

/**
 * Comprehensive forecasting function
 * Provides simple moving average, exponential smoothing, and automatic best method selection
 */
export const comprehensiveForecast = (
  data: number[],
  periods: number
): {
  simple: { forecast: number[]; confidence: null };
  exponential: { forecast: number[]; confidence: { lower: number[]; upper: number[] } };
  best: { forecast: number[]; confidence: { lower: number[]; upper: number[] } | null; method: string };
} => {
  // Simple moving average forecast
  const simpleForecast: number[] = [];
  const avg = data.reduce((sum, val) => sum + val, 0) / data.length;
  for (let i = 0; i < periods; i++) {
    simpleForecast.push(avg);
  }

  // Exponential smoothing forecast
  const alpha = 0.3;
  let lastValue = data[data.length - 1];
  const exponentialForecast: number[] = [];
  const exponentialLower: number[] = [];
  const exponentialUpper: number[] = [];

  // Calculate standard deviation for confidence intervals
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + (val - mean) ** 2, 0) / data.length;
  const stdDev = Math.sqrt(variance);

  for (let i = 0; i < periods; i++) {
    const forecast = lastValue;
    exponentialForecast.push(forecast);
    exponentialLower.push(forecast - 1.96 * stdDev);
    exponentialUpper.push(forecast + 1.96 * stdDev);
    lastValue = alpha * forecast + (1 - alpha) * lastValue;
  }

  // Determine best method based on data volatility
  const volatility = stdDev / Math.abs(mean);
  const bestMethod = volatility < 0.2 ? "exponential" : "simple";
  const bestForecast = bestMethod === "exponential" ? exponentialForecast : simpleForecast;
  const bestConfidence = bestMethod === "exponential" 
    ? { lower: exponentialLower, upper: exponentialUpper }
    : null;

  return {
    simple: { forecast: simpleForecast, confidence: null },
    exponential: { 
      forecast: exponentialForecast, 
      confidence: { lower: exponentialLower, upper: exponentialUpper } 
    },
    best: { forecast: bestForecast, confidence: bestConfidence, method: bestMethod },
  };
};
