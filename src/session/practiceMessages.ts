import type { BatchWarning } from '../model/batch'
import type { BatchEvaluation } from '../model/evaluation'
import type { PracticeSettings } from '../model/settings'

export function formatBatchWarning(warning: BatchWarning): string {
  if (warning.type === 'noEligibleWords') {
    return [
      `No ${warning.script} words for ${warning.targetKana} use only unlocked kana yet.`,
      `There are ${warning.totalTargetWords} target words total,`,
      `but unlocked kana are ${formatUnlockedKana(warning.unlockedKana)}.`,
    ].join(' ')
  }

  const wordLabel = warning.available === 1 ? 'word' : 'words'
  const repeatLabel = warning.duplicated === 1 ? 'word' : 'words'

  return [
    `Only ${warning.available} ${warning.script} ${wordLabel} for ${warning.targetKana}`,
    `use only unlocked kana (${formatUnlockedKana(warning.unlockedKana)}),`,
    `out of ${warning.totalTargetWords} target words total;`,
    `repeated ${warning.duplicated} ${repeatLabel}.`,
  ].join(' ')
}

function formatUnlockedKana(unlockedKana: string[]): string {
  return unlockedKana.join(' ')
}

export function buildOutcomeMessage(
  evaluation: BatchEvaluation,
  previousTarget: string,
  nextTarget: string,
  settings: PracticeSettings,
): string {
  if (previousTarget !== nextTarget) {
    return `${previousTarget} passed. Next target: ${nextTarget}.`
  }

  const missing = getMissingGoalMessages(evaluation, settings)
  if (missing.length > 0) return `Keep going. ${missing.join(' ')}`

  return `Good round. Keep going on ${previousTarget}.`
}

function getMissingGoalMessages(
  evaluation: BatchEvaluation,
  settings: PracticeSettings,
): string[] {
  const messages: string[] = []

  if (evaluation.kpm < settings.targetKpm) {
    messages.push(`Speed needs +${Math.ceil(settings.targetKpm - evaluation.kpm)} kana/min.`)
  }

  if (evaluation.accuracy < settings.targetAccuracy) {
    const missingAccuracy = Math.ceil((settings.targetAccuracy - evaluation.accuracy) * 100)
    messages.push(`Accuracy needs +${missingAccuracy}%.`)
  }

  return messages
}
