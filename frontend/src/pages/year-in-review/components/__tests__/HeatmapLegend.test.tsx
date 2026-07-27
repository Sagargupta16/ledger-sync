import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import HeatmapLegend from '../HeatmapLegend'

describe('HeatmapLegend', () => {
  it('explains both directions of the diverging net scale', () => {
    render(<HeatmapLegend mode="net" />)

    // A bare "Less/More" would leave the darkest red cell reading as top savings.
    expect(screen.getByText('More deficit')).toBeInTheDocument()
    expect(screen.getByText('More surplus')).toBeInTheDocument()
    expect(screen.getByText(/zero or no activity/i)).toBeInTheDocument()
    expect(screen.queryByText('Less')).not.toBeInTheDocument()
  })

  it('keeps the plain Less-to-More ramp for single-sign modes', () => {
    render(<HeatmapLegend mode="expense" />)

    expect(screen.getByText('Less')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
    expect(screen.queryByText('More deficit')).not.toBeInTheDocument()
  })
})
