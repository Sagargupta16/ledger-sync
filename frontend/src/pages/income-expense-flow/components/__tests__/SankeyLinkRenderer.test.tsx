import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SankeyLinkRenderer } from '../SankeyLinkRenderer'

describe('SankeyLinkRenderer', () => {
  it('renders a one-shot draw and no repeating SVG animation', () => {
    const { container } = render(
      <svg>
        <SankeyLinkRenderer
          sourceX={0}
          targetX={200}
          sourceY={20}
          targetY={80}
          sourceControlX={60}
          targetControlX={140}
          linkWidth={12}
          index={2}
        />
      </svg>,
    )

    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelector('animate')).not.toBeInTheDocument()
  })
})
