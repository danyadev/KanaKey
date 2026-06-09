import type { PracticeMode } from './types'

export const HIRAGANA_ORDER = [
  'あ', 'い', 'う', 'え', 'お',
  'か', 'き', 'く', 'け', 'こ',
  'さ', 'し', 'す', 'せ', 'そ',
  'た', 'ち', 'つ', 'て', 'と',
  'な', 'に', 'ぬ', 'ね', 'の',
  'は', 'ひ', 'ふ', 'へ', 'ほ',
  'ま', 'み', 'む', 'め', 'も',
  'や', 'ゆ', 'よ',
  'ら', 'り', 'る', 'れ', 'ろ',
  'わ', 'を', 'ん',
  'が', 'ぎ', 'ぐ', 'げ', 'ご',
  'ざ', 'じ', 'ず', 'ぜ', 'ぞ',
  'だ', 'ぢ', 'づ', 'で', 'ど',
  'ば', 'び', 'ぶ', 'べ', 'ぼ',
  'ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ',
  'ゃ', 'ゅ', 'ょ',
  'っ',
] as const

export const KATAKANA_ORDER = [
  'ア', 'イ', 'ウ', 'エ', 'オ',
  'カ', 'キ', 'ク', 'ケ', 'コ',
  'サ', 'シ', 'ス', 'セ', 'ソ',
  'タ', 'チ', 'ツ', 'テ', 'ト',
  'ナ', 'ニ', 'ヌ', 'ネ', 'ノ',
  'ハ', 'ヒ', 'フ', 'ヘ', 'ホ',
  'マ', 'ミ', 'ム', 'メ', 'モ',
  'ヤ', 'ユ', 'ヨ',
  'ラ', 'リ', 'ル', 'レ', 'ロ',
  'ワ', 'ヲ', 'ン',
  'ガ', 'ギ', 'グ', 'ゲ', 'ゴ',
  'ザ', 'ジ', 'ズ', 'ゼ', 'ゾ',
  'ダ', 'ヂ', 'ヅ', 'デ', 'ド',
  'バ', 'ビ', 'ブ', 'ベ', 'ボ',
  'パ', 'ピ', 'プ', 'ペ', 'ポ',
  'ャ', 'ュ', 'ョ',
  'ッ',
  'ー',
] as const

export const HIRAGANA_RE = /^[ぁ-ゖ]+$/u
export const KATAKANA_RE = /^[ァ-ヺー]+$/u

export function getKanaOrder(mode: PracticeMode): string[] {
  if (mode === 'hiragana') return [...HIRAGANA_ORDER]
  if (mode === 'katakana') return [...KATAKANA_ORDER]
  return [...HIRAGANA_ORDER, ...KATAKANA_ORDER]
}

export function splitKanaUnits(value: string): string[] {
  return Array.from(value).filter((unit) => unit.trim().length > 0)
}

export function kanaScriptFor(value: string): PracticeMode | 'mixed' {
  if (HIRAGANA_RE.test(value)) return 'hiragana'
  if (KATAKANA_RE.test(value)) return 'katakana'
  return 'mixed'
}
