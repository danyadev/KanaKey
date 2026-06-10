import type { PracticeMode } from './modes'

export const HIRAGANA_ORDER = [
  'か', 'い', 'な', 'た', 'し', 'あ', 'る', 'お', 'と', 'く', 'す', 'わ',
  'れ', 'つ', 'う', 'ま', 'こ', 'き', 'え', 'さ', 'ん', 'け', 'が', 'み',
  'は', 'せ', 'ち', 'ら', 'だ', 'や', 'り', 'ょ', 'じ', 'ひ', 'っ', 'ど',
  'も', 'の', 'て', 'そ', 'に', 'ぶ', 'ゅ', 'ゃ', 'む', 'よ', 'ろ', 'め',
  'ふ', 'ね', 'ぎ', 'び', 'ご', 'ば', 'げ', 'ほ', 'ゆ', 'ず', 'べ', 'で',
  'ぼ', 'ぐ', 'ぜ', 'ぬ', 'ぱ', 'ざ', 'へ', 'ぞ', 'づ', 'ぽ', 'ぷ', 'ぴ',
  'を', 'ぢ', 'ぺ',
] as const

export const KATAKANA_ORDER = [
  'ス', 'ー', 'ツ', 'ポ', 'ケ', 'バ', 'ガ', 'キ', 'ロ', 'ゼ', 'ト', 'テ',
  'ノ', 'ッ', 'ペ', 'ラ', 'ク', 'パ', 'ン', 'リ', 'レ', 'プ', 'カ', 'ア',
  'ジ', 'メ', 'ル', 'コ', 'ビ', 'イ', 'オ', 'タ', 'セ', 'ピ', 'ソ', 'ド',
  'フ', 'ベ', 'ボ', 'ュ', 'ニ', 'サ', 'ダ', 'ブ', 'エ', 'ホ', 'ヒ', 'ィ',
  'ギ', 'シ', 'ャ', 'ワ', 'ム', 'グ', 'ズ', 'ナ', 'ウ', 'ネ', 'ォ', 'チ',
  'ハ', 'ェ', 'マ', 'デ', 'ァ', 'ゲ', 'ヌ', 'ヘ', 'ミ', 'モ', 'ヤ', 'ユ',
  'ヨ', 'ヲ', 'ゴ', 'ザ', 'ゾ', 'ヂ', 'ヅ', 'ョ',
] as const

export const HIRAGANA_RE = /^[ぁ-ゖ]+$/u
export const KATAKANA_RE = /^[ァ-ヺー]+$/u

export const ROMAJI_TO_HIRAGANA: Record<string, string> = {
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
  ka: 'か',
  ki: 'き',
  ku: 'く',
  ke: 'け',
  ko: 'こ',
  sa: 'さ',
  shi: 'し',
  si: 'し',
  su: 'す',
  se: 'せ',
  so: 'そ',
  ta: 'た',
  chi: 'ち',
  ti: 'ち',
  tsu: 'つ',
  tu: 'つ',
  te: 'て',
  to: 'と',
  na: 'な',
  ni: 'に',
  nu: 'ぬ',
  ne: 'ね',
  no: 'の',
  ha: 'は',
  hi: 'ひ',
  fu: 'ふ',
  hu: 'ふ',
  he: 'へ',
  ho: 'ほ',
  ma: 'ま',
  mi: 'み',
  mu: 'む',
  me: 'め',
  mo: 'も',
  ya: 'や',
  yu: 'ゆ',
  yo: 'よ',
  ra: 'ら',
  ri: 'り',
  ru: 'る',
  re: 'れ',
  ro: 'ろ',
  wa: 'わ',
  wo: 'を',
  ga: 'が',
  gi: 'ぎ',
  gu: 'ぐ',
  ge: 'げ',
  go: 'ご',
  za: 'ざ',
  ji: 'じ',
  zi: 'じ',
  zu: 'ず',
  ze: 'ぜ',
  zo: 'ぞ',
  da: 'だ',
  di: 'ぢ',
  du: 'づ',
  de: 'で',
  do: 'ど',
  ba: 'ば',
  bi: 'び',
  bu: 'ぶ',
  be: 'べ',
  bo: 'ぼ',
  pa: 'ぱ',
  pi: 'ぴ',
  pu: 'ぷ',
  pe: 'ぺ',
  po: 'ぽ',
  kya: 'きゃ',
  kyu: 'きゅ',
  kyo: 'きょ',
  sha: 'しゃ',
  shu: 'しゅ',
  sho: 'しょ',
  sya: 'しゃ',
  syu: 'しゅ',
  syo: 'しょ',
  cha: 'ちゃ',
  chu: 'ちゅ',
  cho: 'ちょ',
  tya: 'ちゃ',
  tyu: 'ちゅ',
  tyo: 'ちょ',
  nya: 'にゃ',
  nyu: 'にゅ',
  nyo: 'にょ',
  hya: 'ひゃ',
  hyu: 'ひゅ',
  hyo: 'ひょ',
  mya: 'みゃ',
  myu: 'みゅ',
  myo: 'みょ',
  rya: 'りゃ',
  ryu: 'りゅ',
  ryo: 'りょ',
  gya: 'ぎゃ',
  gyu: 'ぎゅ',
  gyo: 'ぎょ',
  ja: 'じゃ',
  ju: 'じゅ',
  jo: 'じょ',
  jya: 'じゃ',
  jyu: 'じゅ',
  jyo: 'じょ',
  bya: 'びゃ',
  byu: 'びゅ',
  byo: 'びょ',
  pya: 'ぴゃ',
  pyu: 'ぴゅ',
  pyo: 'ぴょ',
  la: 'ぁ',
  li: 'ぃ',
  lu: 'ぅ',
  le: 'ぇ',
  lo: 'ぉ',
  xa: 'ぁ',
  xi: 'ぃ',
  xu: 'ぅ',
  xe: 'ぇ',
  xo: 'ぉ',
  lya: 'ゃ',
  lyu: 'ゅ',
  lyo: 'ょ',
  xya: 'ゃ',
  xyu: 'ゅ',
  xyo: 'ょ',
  ltu: 'っ',
  xtu: 'っ',
}

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

export function romajiToKana(text: string): string {
  let output = ''
  let index = 0
  const lowerText = text.toLowerCase()

  while (index < text.length) {
    const char = lowerText[index]
    const nextChar = lowerText[index + 1]

    if (nextChar && isDoubleConsonant(char, nextChar)) {
      output += 'っ'
      index++
      continue
    }

    if (char === 't' && lowerText.slice(index + 1, index + 3) === 'ch') {
      output += 'っ'
      index++
      continue
    }

    const romaji = getFirstRomaji(lowerText.slice(index))
    if (romaji) {
      output += ROMAJI_TO_HIRAGANA[romaji]
      index += romaji.length
      continue
    }

    if (char === 'n' && (nextChar === 'n' || nextChar === '\'')) {
      output += 'ん'
      index += nextChar === 'n' && isVowel(lowerText[index + 2]) ? 1 : 2
      continue
    }

    if (char === 'n' && nextChar && nextChar !== 'y' && isConsonant(nextChar)) {
      output += 'ん'
      index++
      continue
    }

    output += text[index]
    index++
  }

  return output
}

export function getFirstRomaji(string: string): string | null {
  for (let len = Math.min(3, string.length); len >= 1; len--) {
    const romaji = string.slice(0, len)
    if (ROMAJI_TO_HIRAGANA[romaji.toLowerCase()]) {
      return romaji
    }
  }
  return null
}

export function getLastRomaji(string: string) {
  for (let len = Math.min(3, string.length); len >= 1; len--) {
    const romaji = string.slice(-len)
    if (ROMAJI_TO_HIRAGANA[romaji.toLowerCase()]) {
      return romaji
    }
  }
  return null
}

function isDoubleConsonant(char: string, nextChar: string): boolean {
  return char === nextChar && char !== 'n' && isConsonant(char)
}

function isConsonant(char: string): boolean {
  if (!(char >= 'a' && char <= 'z')) return false
  return !isVowel(char)
}

function isVowel(char: string | undefined): boolean {
  return char === 'a' || char === 'i' || char === 'u' || char === 'e' || char === 'o'
}
