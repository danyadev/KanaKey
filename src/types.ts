export type PracticeMode = 'hiragana' | 'katakana' | 'mixed'

export type KanaScript = 'hiragana' | 'katakana' | 'mixed'

export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

export type WordEntry = {
  id: string
  kanji: string | null
  kana: string
  kanaScript: KanaScript
  synthetic?: boolean
  meaning?: string
  jlpt?: JlptLevel
  tags?: string[]
}

export type PracticeSettings = {
  mode: PracticeMode
  batchSize: number
  initialUnlockedCount: number
  targetKpm: number
  targetAccuracy: number
  minAttemptsPerKana: number
  smoothingWindow: number
  doubleWords: boolean
  shuffleDoubledWords: boolean
}

export type KanaAttempt = {
  timestamp: number
  exposures: number
  correct: number
  incorrect: number
  kpm: number
  accuracy: number
}

export type KanaStats = {
  kana: string
  attempts: number
  exposures: number
  correct: number
  incorrect: number
  recentAttempts: KanaAttempt[]
  smoothedKpm: number
  smoothedAccuracy: number
  passed: boolean
  lastSeenAt: number | null
}

export type SessionResult = {
  timestamp: number
  mode: PracticeMode
  targetKana: string
  words: string[]
  elapsedMs: number
  kpm: number
  accuracy: number
}

export type ProgressState = {
  mode: PracticeMode
  unlockedCountByMode: Record<PracticeMode, number>
  currentTargetKanaByMode: Record<PracticeMode, string>
  kanaStatsByMode: Record<PracticeMode, Record<string, KanaStats>>
  sessionHistory: SessionResult[]
}

export type PracticeWord = WordEntry & {
  repetitionId: string
}

export type BatchResult = {
  words: PracticeWord[]
  warning: string | null
}

export type BatchEvaluation = {
  expected: string
  actual: string
  elapsedMs: number
  totalExpectedKana: number
  correctKanaCount: number
  kpm: number
  accuracy: number
  perKana: Record<string, { exposures: number; correct: number; incorrect: number }>
}
