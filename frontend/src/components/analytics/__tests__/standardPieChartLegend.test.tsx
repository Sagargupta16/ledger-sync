/**
 * Guards the props StandardPieChart hands `<Legend>`.
 *
 * It passed `align="center" verticalAlign="bottom"`. Recharts 3.10 deprecates
 * both in favour of `position`, and both values it passed were already the
 * component's own defaults -- so the two props were pure noise that would break
 * on the 4.0 removal while changing nothing today.
 *
 * "Nothing today" is the claim that needs proof, not assertion. jsdom reports a
 * 0x0 container so Recharts never paints a legend to compare, so the proof is
 * assembled from two verifiable halves:
 *
 *  1. Prop capture -- what this component actually sends to `<Legend>`.
 *  2. The INSTALLED recharts' declared defaults, read out of the shipped
 *     `Legend.d.ts` in node_modules. If a future bump changes either default, or
 *     un-deprecates the props, these tests fail rather than quietly leaving the
 *     legend somewhere new.
 */

import type { ReactNode } from 'react'

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Props of interest off the `<Legend>` element, captured verbatim. */
const captured: { legend?: Record<string, unknown>; rendered: number } = { rendered: 0 }

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const Passthrough = ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>
  return {
    ...actual,
    ResponsiveContainer: Passthrough,
    PieChart: Passthrough,
    Pie: () => null,
    Tooltip: () => null,
    Legend: (props: Record<string, unknown>) => {
      captured.legend = props
      captured.rendered += 1
      return null
    },
  }
})

/** Imported after the mock is registered so the mocked recharts is used. */
const { default: StandardPieChart } = await import('../StandardPieChart')

const DATA = [
  { name: 'Rent', value: 30_000 },
  { name: 'Food', value: 12_000 },
]

/**
 * The installed package's own declared defaults, not a remembered pair of
 * strings. `import.meta.glob` with `?raw` reaches into node_modules, so this
 * reads whatever version is actually resolved for the build.
 */
function rechartsLegendDeclaration(): string {
  const files = import.meta.glob('/node_modules/recharts/types/component/Legend.d.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  const source = Object.values(files)[0]
  if (source === undefined) throw new Error('recharts Legend.d.ts not found in node_modules')
  return source
}

/**
 * `align` is inherited from `DefaultLegendContentProps` rather than redeclared on
 * `Legend`, so its deprecation tag lives in the other file.
 */
function rechartsLegendContentDeclaration(): string {
  const files = import.meta.glob('/node_modules/recharts/types/component/DefaultLegendContent.d.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  const source = Object.values(files)[0]
  if (source === undefined) {
    throw new Error('recharts DefaultLegendContent.d.ts not found in node_modules')
  }
  return source
}

/** The `legendDefaultProps` object literal, sliced out by brace depth. */
function defaultsBlock(source: string): string {
  const open = source.indexOf('{', source.indexOf('export declare const legendDefaultProps'))
  if (open === -1) throw new Error('legendDefaultProps not found in recharts Legend.d.ts')
  // Brace counting, not a lazy regex: the block contains `labelStyle: {}`, which
  // a `[\s\S]*?};` match would stop at, silently truncating the later entries.
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error('legendDefaultProps block is unterminated')
}

/** Reads `readonly <name>: "<value>";` out of the `legendDefaultProps` block. */
function declaredDefault(source: string, name: string): string | undefined {
  return new RegExp(`readonly ${name}: "([^"]+)"`).exec(defaultsBlock(source))?.[1]
}

/**
 * Whether the JSDoc comment immediately preceding `<prop>?:` carries
 * `@deprecated`. Scoped to that one comment block so a `@deprecated` tag on some
 * earlier prop cannot be mistaken for this one's.
 */
function isDeprecated(source: string, prop: string): boolean {
  const decl = new RegExp(`^\\s*${prop}\\?:`, 'm').exec(source)
  if (decl?.index === undefined) throw new Error(`prop ${prop} not declared in Legend.d.ts`)
  const before = source.slice(0, decl.index)
  const commentStart = before.lastIndexOf('/**')
  const commentEnd = before.lastIndexOf('*/')
  if (commentStart === -1 || commentEnd < commentStart) return false
  return before.slice(commentStart, commentEnd).includes('@deprecated')
}

describe('StandardPieChart legend props', () => {
  beforeEach(() => {
    captured.legend = undefined
    captured.rendered = 0
  })

  it('sends no deprecated positioning props', () => {
    render(<StandardPieChart data={DATA} ariaLabel="Spending by category" />)

    expect(captured.rendered).toBe(1)
    expect(captured.legend).not.toHaveProperty('align')
    expect(captured.legend).not.toHaveProperty('verticalAlign')
  })

  it('lands the legend in the same place, because the removed values were the defaults', () => {
    // The equivalence the removal rests on, resolved the way recharts resolves
    // it: `position` is undefined here, so align/verticalAlign still decide the
    // placement, and an absent prop takes the package's declared default. Those
    // defaults must be the exact pair that used to be spelled out -- 'center'
    // and 'bottom' -- or the legend moved.
    const source = rechartsLegendDeclaration()
    const defaults = {
      align: declaredDefault(source, 'align'),
      verticalAlign: declaredDefault(source, 'verticalAlign'),
    }

    render(<StandardPieChart data={DATA} ariaLabel="Spending by category" />)
    const legend = captured.legend ?? {}
    expect(legend).not.toHaveProperty('position')

    const effective = { ...defaults, ...legend }
    expect(effective.align).toBe('center')
    expect(effective.verticalAlign).toBe('bottom')
  })

  it('only drops props the installed recharts marks deprecated', () => {
    // Justification check: if a bump un-deprecates them, or deprecates `layout`
    // too, this is where that shows up rather than in a broken chart.
    expect(isDeprecated(rechartsLegendDeclaration(), 'verticalAlign')).toBe(true)
    expect(isDeprecated(rechartsLegendContentDeclaration(), 'align')).toBe(true)
    expect(isDeprecated(rechartsLegendDeclaration(), 'layout')).toBe(false)
  })

  it('keeps the non-deprecated layout and the shared legend defaults', () => {
    // `layout` is NOT deprecated, and its 3.10 default is `auto` -- which only
    // resolves to horizontal while `position` is undefined. Keeping it explicit
    // is what makes that independent of a future `position` being added.
    render(<StandardPieChart data={DATA} ariaLabel="Spending by category" />)

    expect(captured.legend?.layout).toBe('horizontal')
    expect(captured.legend?.iconType).toBe('circle')
    expect(captured.legend?.iconSize).toBe(8)
  })

  it('renders no legend at all when showLegend is false', () => {
    render(<StandardPieChart data={DATA} showLegend={false} ariaLabel="Spending by category" />)

    expect(captured.rendered).toBe(0)
  })
})
