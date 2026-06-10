export type PracticeDraft = {
  typedText: string
  startedAt: number | null
}

export function resetPracticeDraft(): PracticeDraft {
  return {
    typedText: '',
    startedAt: null,
  }
}
