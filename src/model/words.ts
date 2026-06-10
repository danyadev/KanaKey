import type { PracticeMode } from './modes'

export type KanaScript = PracticeMode

export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

export type WordEntry = {
  script: KanaScript
  kana: string
  kanji?: string
  meaning: string
  jlpt: JlptLevel
}

export type PracticeWord = WordEntry & {
  repetitionId: string
}
