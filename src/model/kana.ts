import type { PracticeMode } from './modes'

export const HIRAGANA_ORDER = [
  'あ', 'い', 'し', 'き', 'か', 'こ', 'う', 'お', 'え', 'く', 'さ', 'つ',
  'け', 'た', 'ち', 'と', 'ね', 'の', 'ほ', 'ま', 'む', 'や', 'わ', 'ん',
  'そ', 'て', 'ぬ', 'ひ', 'ふ', 'へ', 'め', 'も', 'ゆ', 'ろ', 'ぎ', 'げ',
  'で', 'せ', 'み', 'ず', 'な', 'に', 'は', 'よ', 'る', 'ら', 'り', 'ご',
  'れ', 'を', 'が', 'っ', 'ざ', 'ぐ', 'じ', 'ぜ', 'ぞ', 'だ', 'ぢ', 'づ',
  'ど', 'ば', 'び', 'ぶ', 'べ', 'ょ', 'ぼ', 'ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ',
  'ゃ', 'ゅ',
] as const

export const KATAKANA_ORDER = [
  'ス', 'キ', 'ー', 'バ', 'パ', 'ン', 'レ', 'ア', 'カ', 'ラ', 'シ', 'コ',
  'テ', 'ト', 'イ', 'メ', 'ロ', 'ク', 'ニ', 'リ', 'ジ', 'ビ', 'ホ', 'エ',
  'オ', 'ギ', 'ゲ', 'サ', 'タ', 'ツ', 'ド', 'ヒ', 'マ', 'ム', 'ャ', 'ウ',
  'ケ', 'セ', 'ソ', 'チ', 'ナ', 'ヌ', 'ネ', 'ノ', 'ハ', 'フ', 'ヘ', 'ミ',
  'モ', 'ル', 'ヤ', 'ユ', 'ヨ', 'ワ', 'ヲ', 'ガ', 'グ', 'ゴ', 'ザ', 'ズ',
  'ゼ', 'ゾ', 'ダ', 'ヂ', 'ヅ', 'デ', 'ブ', 'ベ', 'ボ', 'ピ', 'プ', 'ペ',
  'ポ', 'ュ', 'ョ', 'ッ',
] as const

export const HIRAGANA_RE = /^[ぁ-ゖ]+$/u
export const KATAKANA_RE = /^[ァ-ヺー]+$/u

export function getKanaOrder(mode: PracticeMode): string[] {
  if (mode === 'hiragana') return [...HIRAGANA_ORDER]
  if (mode === 'katakana') return [...KATAKANA_ORDER]
  return interleaveOrders(HIRAGANA_ORDER, KATAKANA_ORDER)
}

export function splitKanaUnits(value: string): string[] {
  return Array.from(value).filter((unit) => unit.trim().length > 0)
}

export function kanaScriptFor(value: string): PracticeMode | 'mixed' {
  if (HIRAGANA_RE.test(value)) return 'hiragana'
  if (KATAKANA_RE.test(value)) return 'katakana'
  return 'mixed'
}

function interleaveOrders(left: readonly string[], right: readonly string[]): string[] {
  const result: string[] = []
  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    if (left[index]) result.push(left[index])
    if (right[index]) result.push(right[index])
  }
  return result
}
