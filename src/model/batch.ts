import { kanaScriptFor, splitKanaUnits } from './kana'
import { getUnlockedKana } from './progress'
import { normalizeSettings } from './settings'
import type { ProgressState } from './progress'
import type { PracticeSettings } from './settings'
import type { PracticeWord, WordEntry } from './words'

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

type ScriptQuota = {
  script: KanaPracticeScript
  count: number
}

type ScriptBatchInput = {
  script: KanaPracticeScript
  targetKana: string
  count: number
  eligibleWords: WordEntry[]
  random: () => number
}

export function generateBatch(
  words: WordEntry[],
  settings: PracticeSettings,
  progress: ProgressState,
  random: () => number = Math.random,
): BatchResult {
  const normalizedSettings = normalizeSettings(settings)

  if (normalizedSettings.mode === 'mixed') {
    return generateMixedBatch(words, normalizedSettings, progress, random)
  }

  const script = normalizedSettings.mode
  const targetKana = progress.currentTargetKanaByMode[script]
  const eligibleWords = getEligibleTargetWords(words, progress, script, targetKana)

  return buildScriptBatch({
    script,
    targetKana,
    count: normalizedSettings.batchSize,
    eligibleWords,
    random,
  })
}

export function getEligibleTargetWords(
  words: WordEntry[],
  progress: ProgressState,
  script: KanaPracticeScript,
  targetKana: string,
): WordEntry[] {
  const unlockedKana = new Set(getUnlockedKana(progress, script))

  return words
    .filter((word) => matchesScript(word, script))
    .filter((word) => isWordUnlocked(word, unlockedKana))
    .filter((word) => containsTargetKana(word, targetKana))
}

function generateMixedBatch(
  words: WordEntry[],
  settings: PracticeSettings,
  progress: ProgressState,
  random: () => number,
): BatchResult {
  const quotas = splitMixedQuota(settings.batchSize, random)
  const parts = quotas.map((quota) => {
    const targetKana = progress.currentTargetKanaByMode[quota.script]
    return buildScriptBatch({
      script: quota.script,
      targetKana,
      count: quota.count,
      eligibleWords: getEligibleTargetWords(words, progress, quota.script, targetKana),
      random,
    })
  })

  return {
    words: withRepetitionIds(shuffleWords(parts.flatMap((part) => part.words), random)),
    warnings: parts.flatMap((part) => part.warnings),
  }
}

function splitMixedQuota(batchSize: number, random: () => number): ScriptQuota[] {
  let hiragana = 0
  let katakana = 0

  for (let index = 0; index < batchSize; index += 1) {
    if (random() < 0.5) hiragana += 1
    else katakana += 1
  }

  if (batchSize > 1 && hiragana === 0) {
    hiragana = 1
    katakana -= 1
  }
  if (batchSize > 1 && katakana === 0) {
    katakana = 1
    hiragana -= 1
  }

  const quotas: ScriptQuota[] = [
    { script: 'hiragana', count: hiragana },
    { script: 'katakana', count: katakana },
  ]

  return quotas.filter((quota) => quota.count > 0)
}

function buildScriptBatch(input: ScriptBatchInput): BatchResult {
  const { script, targetKana, count, eligibleWords, random } = input

  if (count <= 0) return { words: [], warnings: [] }

  if (eligibleWords.length === 0) {
    return {
      words: [],
      warnings: [{ type: 'noEligibleWords', script, targetKana }],
    }
  }

  const uniqueWords = takeShuffled(eligibleWords, Math.min(count, eligibleWords.length), random)
  const duplicatedWords = duplicateToCount(uniqueWords, eligibleWords, count, random)
  const warnings: BatchWarning[] = []

  if (eligibleWords.length < count) {
    warnings.push({
      type: 'duplicatedToFill',
      script,
      targetKana,
      available: eligibleWords.length,
      needed: count,
      duplicated: count - eligibleWords.length,
    })
  }

  return {
    words: withRepetitionIds(duplicatedWords),
    warnings,
  }
}

function duplicateToCount(
  selectedWords: WordEntry[],
  eligibleWords: WordEntry[],
  count: number,
  random: () => number,
): WordEntry[] {
  const result = [...selectedWords]

  while (result.length < count) {
    result.push(eligibleWords[Math.floor(random() * eligibleWords.length)])
  }

  return result.length > selectedWords.length ? shuffleWords(result, random) : result
}

function matchesScript(word: WordEntry, script: KanaPracticeScript): boolean {
  if (word.script === script) return true
  return kanaScriptFor(word.kana) === script
}

function isWordUnlocked(word: WordEntry, unlockedKana: Set<string>): boolean {
  return splitKanaUnits(word.kana).every((unit) => unlockedKana.has(unit))
}

function containsTargetKana(word: WordEntry, targetKana: string): boolean {
  return splitKanaUnits(word.kana).includes(targetKana)
}

function takeShuffled<T>(items: T[], count: number, random: () => number): T[] {
  return shuffleWords(items, random).slice(0, count)
}

function shuffleWords<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

function withRepetitionIds(words: WordEntry[]): PracticeWord[] {
  return words.map((word, index) => ({
    ...word,
    repetitionId: `${wordKey(word)}-${index}`,
  }))
}

function wordKey(word: WordEntry): string {
  return word.kanji ? `${word.kanji}【${word.kana}】` : word.kana
}
