import type { KeyValueStorage } from './kanaKeyStorage'

export type KanaFontChoice = 'gothic' | 'system' | 'mincho'

const KANA_FONT_KEY = 'kanakey:ui:kanaFont'
const DEFAULT_KANA_FONT: KanaFontChoice = 'gothic'
const KANA_FONT_CHOICES = new Set<KanaFontChoice>(['gothic', 'system', 'mincho'])

export function createKanaFontStorage(storage: KeyValueStorage) {
  return {
    loadKanaFontChoice(): KanaFontChoice {
      const value = storage.getItem(KANA_FONT_KEY)
      return isKanaFontChoice(value) ? value : DEFAULT_KANA_FONT
    },

    saveKanaFontChoice(choice: KanaFontChoice): void {
      storage.setItem(KANA_FONT_KEY, choice)
    },
  }
}

export const browserKanaFontStorage = createKanaFontStorage(localStorage)

function isKanaFontChoice(value: unknown): value is KanaFontChoice {
  return typeof value === 'string' && KANA_FONT_CHOICES.has(value as KanaFontChoice)
}
