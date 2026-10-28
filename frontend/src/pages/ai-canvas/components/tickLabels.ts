type Format = (value: number) => string

/**
 * Tick values and their labels. A narrow domain can give two ticks the same
 * short label (105K and 110K both read "1.1L"); then every tick takes the
 * precise `fallback` instead, so no two labels on an axis ever read the same.
 */
export function tickLabels(values: readonly number[], format: Format, fallback?: Format): [number, string][] {
  const short = values.map(format)
  const labels = fallback && new Set(short).size < short.length ? values.map(fallback) : short
  return values.map((value, index) => [value, labels[index]])
}
