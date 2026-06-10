import { describe, expect, it } from 'vitest'

import { romajiToKana } from './kana'

describe('romajiToKana', () => {
  it('converts basic vowels', () => {
    expect(romajiToKana('a i u e o')).toBe('あ い う え お')
  })

  it('converts basic consonant rows', () => {
    expect(romajiToKana('kakikukeko')).toBe('かきくけこ')
    expect(romajiToKana('sashisuseso')).toBe('さしすせそ')
    expect(romajiToKana('tatitsuteto')).toBe('たちつてと')
  })

  it('converts contracted kya/sha/cha-style romaji', () => {
    expect(romajiToKana('kyakyukyo')).toBe('きゃきゅきょ')
    expect(romajiToKana('shashusho')).toBe('しゃしゅしょ')
    expect(romajiToKana('chachucho')).toBe('ちゃちゅちょ')
    expect(romajiToKana('nyanyunyo')).toBe('にゃにゅにょ')
    expect(romajiToKana('ryaryuryo')).toBe('りゃりゅりょ')
  })

  it('converts double consonants to small tsu', () => {
    expect(romajiToKana('kko')).toBe('っこ')
    expect(romajiToKana('gakkou')).toBe('がっこう')
    expect(romajiToKana('matcha')).toBe('まっちゃ')
  })

  it('converts nn to ん', () => {
    expect(romajiToKana('konnichiha')).toBe('こんにちは')
  })

  it("converts n' to ん", () => {
    expect(romajiToKana("kin'youbi")).toBe('きんようび')
  })

  it('converts n before consonants such as nka to んか', () => {
    expect(romajiToKana('nka')).toBe('んか')
    expect(romajiToKana('kenka')).toBe('けんか')
  })

  it('keeps ny combinations as にゃ-style kana', () => {
    expect(romajiToKana('nya')).toBe('にゃ')
    expect(romajiToKana('nyu')).toBe('にゅ')
    expect(romajiToKana('nyo')).toBe('にょ')
  })

  it('leaves unfinished romaji visible where expected', () => {
    expect(romajiToKana('k')).toBe('k')
    expect(romajiToKana('ak')).toBe('あk')
    expect(romajiToKana('ny')).toBe('ny')
    expect(romajiToKana('kan')).toBe('かn')
  })
})
