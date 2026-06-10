export type KanaFontChoice = 'gothic' | 'system' | 'mincho'

const KANA_FONT_KEY = 'kanakey:ui:kanaFont'
const DEFAULT_KANA_FONT: KanaFontChoice = 'gothic'
const KANA_FONT_CHOICES = new Set<KanaFontChoice>(['gothic', 'system', 'mincho'])

export function loadKanaFontChoice(): KanaFontChoice {
  if (typeof localStorage === 'undefined') return DEFAULT_KANA_FONT
  const value = localStorage.getItem(KANA_FONT_KEY)
  return isKanaFontChoice(value) ? value : DEFAULT_KANA_FONT
}

export function saveKanaFontChoice(choice: KanaFontChoice): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KANA_FONT_KEY, choice)
}

function isKanaFontChoice(value: unknown): value is KanaFontChoice {
  return typeof value === 'string' && KANA_FONT_CHOICES.has(value as KanaFontChoice)
}
