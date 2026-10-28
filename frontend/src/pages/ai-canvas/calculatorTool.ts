/**
 * `calculate`: a browser-side tool that runs financial maths in code (calculators.ts)
 * and returns exact yearly rows the model can chart with source "calculated".
 */

import type { ClientTool } from '@/components/chat/useChat'

import { cagr, goal, inflation, loan, lumpsum, sip, type Calculation } from './calculators'

const KINDS = ['sip', 'lumpsum', 'loan', 'inflation', 'goal', 'cagr'] as const
type Kind = (typeof KINDS)[number]

const LIMITS = { amount: 1e12, rate: 100, years: 50, stepUp: 50 } as const

class CalculatorArgError extends Error {}

function num(input: Record<string, unknown>, field: string, min: number, max: number, fallback?: number): number {
  const raw = input[field]
  if (raw === undefined && fallback !== undefined) return fallback
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new CalculatorArgError(`${field} must be a number from ${min} to ${max}`)
  }
  return value
}

function years(input: Record<string, unknown>): number {
  const value = num(input, 'years', 1, LIMITS.years)
  if (!Number.isInteger(value)) throw new CalculatorArgError('years must be a whole number')
  return value
}

function run(kind: Kind, input: Record<string, unknown>): Calculation {
  const rate = (fallback?: number) => num(input, 'annual_rate_pct', 0, LIMITS.rate, fallback)
  switch (kind) {
    case 'sip':
      return sip(
        num(input, 'amount', 1, LIMITS.amount),
        rate(),
        years(input),
        num(input, 'step_up_pct', 0, LIMITS.stepUp, 0),
        num(input, 'starting_amount', 0, LIMITS.amount, 0),
      )
    case 'lumpsum':
      return lumpsum(num(input, 'amount', 1, LIMITS.amount), rate(), years(input), input.compounding === 'monthly')
    case 'loan':
      return loan(num(input, 'amount', 1, LIMITS.amount), rate(), years(input))
    case 'inflation':
      return inflation(num(input, 'amount', 1, LIMITS.amount), rate(), years(input))
    case 'goal':
      return goal(num(input, 'amount', 1, LIMITS.amount), rate(), years(input))
    case 'cagr':
      return cagr(num(input, 'amount', 1, LIMITS.amount), num(input, 'end_amount', 1, LIMITS.amount), years(input))
  }
}

export const CALCULATE_TOOL: ClientTool = {
  spec: {
    name: 'calculate',
    description:
      'Run a financial calculation in code and get exact yearly rows to chart with source "calculated": ' +
      'sip (monthly amount, optional yearly step-up and starting amount), lumpsum, loan (EMI schedule: ' +
      'principal and interest paid and balance per year), inflation (future cost of an amount), goal ' +
      '(monthly SIP that reaches a target) or cagr (growth rate between two amounts). Use it instead of ' +
      'doing the maths yourself; take amounts from the data tools when the user means their own numbers.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'amount', 'years'],
      properties: {
        kind: { type: 'string', enum: [...KINDS] },
        amount: { type: 'number', description: 'INR: the monthly SIP, lump sum, loan principal, amount to inflate, goal target, or start amount for cagr' },
        annual_rate_pct: { type: 'number', description: 'Yearly return, interest or inflation rate in percent (12 means 12%); not used by cagr' },
        years: { type: 'integer', minimum: 1, maximum: LIMITS.years },
        step_up_pct: { type: 'number', description: 'sip only: yearly increase of the monthly amount, percent' },
        starting_amount: { type: 'number', description: 'sip only: corpus already invested' },
        end_amount: { type: 'number', description: 'cagr only: the later amount' },
        compounding: { type: 'string', enum: ['yearly', 'monthly'], description: 'lumpsum only (default yearly)' },
      },
    },
  },
  run: (input) => {
    try {
      const kind = input.kind
      if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) {
        throw new CalculatorArgError(`kind must be one of ${KINDS.join(', ')}`)
      }
      if (kind !== 'cagr') num(input, 'annual_rate_pct', 0, LIMITS.rate)
      return run(kind as Kind, input)
    } catch (error) {
      if (error instanceof CalculatorArgError) {
        return { error: `${error.message}. Fix the arguments and call calculate again.` }
      }
      throw error
    }
  },
}
