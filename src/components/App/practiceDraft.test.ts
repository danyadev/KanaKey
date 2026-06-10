import { describe, expect, it } from 'vitest'

import { resetPracticeDraft } from './practiceDraft'

describe('practice draft helpers', () => {
  it('clears typed text and timer for a new batch', () => {
    expect(resetPracticeDraft()).toEqual({ typedText: '', startedAt: null })
  })
})
