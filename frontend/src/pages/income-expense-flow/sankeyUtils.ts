import { rawColors } from '@/constants/colors'

export function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function getNodeFillColor(
  index: number,
  incomeCategoryCount: number,
  totalIncomeNodeIndex: number,
  savingsNodeIndex: number,
  expensesNodeIndex: number,
): string {
  if (index < incomeCategoryCount) {
    const greenColors = [
      rawColors.app.green,
      rawColors.app.green,
      rawColors.app.greenVibrant,
      rawColors.app.teal,
      rawColors.app.tealVibrant,
    ]
    return greenColors[index % greenColors.length]
  }

  if (index === totalIncomeNodeIndex) return rawColors.app.indigoVibrant
  if (index === savingsNodeIndex) return rawColors.app.purple
  if (index === expensesNodeIndex) return rawColors.app.red

  // Expense categories stay in the red family so they read as "expense=red"
  // and match the legend; orange/yellow drifted toward income/savings hues.
  const redColors = [
    rawColors.app.red,
    rawColors.app.redVibrant,
    rawColors.app.pink,
    rawColors.app.pinkVibrant,
  ]
  const expenseIndex = index - (incomeCategoryCount + 3)
  return redColors[expenseIndex % redColors.length]
}
