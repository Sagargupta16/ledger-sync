export function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}
