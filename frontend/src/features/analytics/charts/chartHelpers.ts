/**
 * Chart Helper Functions
 * Shared utilities for chart data processing and configuration
 */

import { getCommonChartOptions, truncateLabel } from "../../../lib/charts";

export const commonChartOptions = getCommonChartOptions();

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
