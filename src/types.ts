export type PracticeMode = 'hiragana' | 'katakana' | 'mixed'

export type KanaScript = 'hiragana' | 'katakana' | 'mixed'

export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

export type WordEntry = {
  script: KanaScript
  kana: string
  kanji?: string
  meaning: string
  jlpt: JlptLevel
}

export type PracticeSettings = {
  mode: PracticeMode
  batchSize: number
  targetKpm: number
  targetAccuracy: number
  smoothingAppearanceCount: number
  dailyPracticeMinutesGoal: number
  showWordSeparator: boolean
}

export type KanaAttempt = {
  timestamp: number
  attemptNumber: number
  appearanceCount: number
  correctCount: number
  allocatedMs: number
}

export type KanaStats = {
  kana: string
  attempts: number
  appearances: number
  correct: number
  incorrect: number
  history: KanaAttempt[]
  smoothedKpm: number
  smoothedAccuracy: number
  passed: boolean
  lastSeenAt: number | null
}

export type WordTiming = {
  word: string
  index: number
  durationMs: number
  completedAtMs: number
}

export type SessionResult = {
  timestamp: number
  mode: PracticeMode
  targetKana: string
  words: string[]
  elapsedMs: number
  kpm: number
  accuracy: number
  wordTimings: WordTiming[]
}

export type PracticeTimeState = {
  todayDate: string
  todayMs: number
  totalMs: number
}

export type ProgressState = {
  mode: PracticeMode
  unlockedCountByMode: Record<PracticeMode, number>
  currentTargetKanaByMode: Record<PracticeMode, string>
  kanaStats: Record<string, KanaStats>
  sessionHistory: SessionResult[]
  practiceTime: PracticeTimeState
  nextAttemptNumber: number
}

export type PracticeWord = WordEntry & {
  repetitionId: string
}

export type KanaPracticeScript = 'hiragana' | 'katakana'

export type BatchWarning =
  | {
    type: 'noEligibleWords'
    script: KanaPracticeScript
    targetKana: string
  }
  | {
    type: 'duplicatedToFill'
    script: KanaPracticeScript
    targetKana: string
    available: number
    needed: number
    duplicated: number
  }

export type BatchResult = {
  words: PracticeWord[]
  warnings: BatchWarning[]
}

export type PerKanaEvaluation = {
  appearanceCount: number
  correctCount: number
  allocatedMs: number
}

export type BatchEvaluation = {
  expected: string
  actual: string
  elapsedMs: number
  totalExpectedKana: number
  correctKanaCount: number
  kpm: number
  accuracy: number
  perKana: Record<string, PerKanaEvaluation>
  wordTimings: WordTiming[]
}
