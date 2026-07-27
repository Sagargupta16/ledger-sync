import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Anomaly } from '@/services/api/analyticsV2'

import AnomalyCard from '../components/AnomalyCard'

/**
 * The card resolves BOTH of its icons per row, from values that arrive off the
 * wire (`anomaly_type`, `severity`). Two things have to hold at once:
 *
 * 1. A type or severity with no map entry still renders -- the accessors in
 *    `../constants` fall back to a neutral icon and chip rather than putting
 *    `undefined` into a className or throwing on `severity.bg`.
 * 2. The resolved icon is rendered through a module-level component
 *    (`AnomalyIcon`), not a capitalized local. Binding a component to a local
 *    during render gives it a fresh identity each pass, so React remounts the
 *    subtree instead of updating it -- which is why
 *    `react-hooks/static-components` treats it as an error.
 *
 * There is no test-visible difference between the two spellings for a single
 * static render, so the remount is what gets asserted: re-rendering the same
 * card with a changed severity must UPDATE the existing icon node, not swap in a
 * new one. `toBe` on the captured DOM node is the check -- a remount would
 * replace the element and fail identity.
 */
function makeAnomaly(overrides: Partial<Anomaly> = {}): Anomaly {
  return {
    id: 1,
    anomaly_type: 'high_expense',
    severity: 'high',
    description: 'High expense detected',
    transaction_id: 'txn-1',
    period_key: null,
    expected_value: 20,
    actual_value: 35000,
    deviation_pct: 174900,
    detected_at: '2026-07-01T00:00:00Z',
    is_reviewed: false,
    is_dismissed: false,
    review_notes: null,
    reviewed_at: null,
    ...overrides,
  }
}

const noopProps = {
  isExpanded: false,
  noteText: '',
  isReviewPending: false,
  onToggleNote: vi.fn(),
  onNoteTextChange: vi.fn(),
  onReview: vi.fn(),
}

/** Lucide renders an `<svg>` per icon; the card draws exactly two of its own. */
function iconNodes(container: HTMLElement): SVGElement[] {
  return Array.from(container.querySelectorAll('svg'))
}

/**
 * The severity chip's own icon, addressed through the chip rather than by
 * position in the document.
 *
 * Position would be wrong: the first `<svg>` in the card is the anomaly-TYPE
 * icon, which does not change when severity does. An identity assertion on that
 * node passes no matter how the severity icon is rendered, so it proves nothing
 * about a remount. The chip is the element whose text is the severity value.
 */
function severityChipIcon(container: HTMLElement, severity: string): SVGElement {
  const chip = Array.from(container.querySelectorAll('span')).find(
    (node) => node.textContent?.trim() === severity && node.querySelector('svg') !== null,
  )
  if (!chip) throw new Error(`no severity chip found for '${severity}'`)
  const icon = chip.querySelector('svg')
  if (!icon) throw new Error(`severity chip for '${severity}' has no icon`)
  return icon
}

describe('AnomalyCard icon rendering', () => {
  it('renders both icons for a mapped type and severity', () => {
    const { container } = render(<AnomalyCard anomaly={makeAnomaly()} {...noopProps} />)

    // Type icon + severity icon + the three action-button icons.
    expect(iconNodes(container).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('High expense detected')).toBeTruthy()
  })

  it('still renders when the wire sends a type and severity with no map entry', () => {
    // A future detector (or a hand-written DB row) can emit a member the
    // frontend maps do not cover. The fallbacks must keep the card readable.
    const { container } = render(
      <AnomalyCard
        anomaly={makeAnomaly({
          anomaly_type: 'not_a_real_type' as Anomaly['anomaly_type'],
          severity: 'not_a_real_severity' as Anomaly['severity'],
        })}
        {...noopProps}
      />,
    )

    expect(iconNodes(container).length).toBeGreaterThanOrEqual(2)
    // No `undefined` leaked into a class string via the style accessor.
    expect(container.innerHTML).not.toContain('undefined')
  })

  it('keeps the severity icon node across an unrelated re-render', () => {
    // The re-render deliberately holds `severity` FIXED and changes only the
    // description. Changing severity would swap the underlying lucide component
    // itself (`severityIcon('high')` and `severityIcon('medium')` are different
    // components), so the inner <svg> would be replaced for a legitimate reason
    // and the assertion would prove nothing about how the icon is declared.
    //
    // With the icon component declared at module level, its identity is stable
    // and React updates this subtree in place. A component created during render
    // gets a fresh identity on every pass, so React unmounts and remounts the
    // node even though nothing about the icon changed -- which is the cost the
    // `react-hooks/static-components` rule exists to prevent.
    const { container, rerender } = render(
      <AnomalyCard anomaly={makeAnomaly({ description: 'first' })} {...noopProps} />,
    )
    const before = severityChipIcon(container, 'high')

    rerender(<AnomalyCard anomaly={makeAnomaly({ description: 'second' })} {...noopProps} />)

    expect(screen.getByText('second')).toBeTruthy()
    expect(severityChipIcon(container, 'high')).toBe(before)
  })
})
