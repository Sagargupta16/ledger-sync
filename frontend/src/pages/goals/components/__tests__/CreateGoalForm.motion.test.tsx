import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { AnimatePresence } from 'motion/react'
import { describe, expect, it, vi } from 'vitest'

import CreateGoalForm from '../CreateGoalForm'

const FORM_DATA = {
  name: '',
  goal_type: 'emergency_fund',
  target_amount: '',
  target_date: '',
  notes: '',
}

function FormHarness() {
  const [visible, setVisible] = useState(true)

  return (
    <>
      <button type="button" onClick={() => setVisible(false)}>
        Close form
      </button>
      <AnimatePresence>
        {visible && (
          <CreateGoalForm
            formData={FORM_DATA}
            isPending={false}
            onFormDataChange={vi.fn()}
            onSubmit={vi.fn()}
            onCancel={vi.fn()}
          />
        )}
      </AnimatePresence>
    </>
  )
}

describe('CreateGoalForm disclosure motion', () => {
  it('pops out of layout when its parent presence boundary removes it', () => {
    render(<FormHarness />)

    const form = screen.getByRole('heading', { name: 'Create New Goal' }).closest('form')
    const motionRoot = form?.parentElement
    expect(motionRoot).not.toBeNull()

    if (!motionRoot) return
    motionRoot.style.width = '640px'
    motionRoot.style.height = '320px'

    fireEvent.click(screen.getByRole('button', { name: 'Close form' }))

    expect(motionRoot).toHaveAttribute('data-motion-pop-id')
  })
})
