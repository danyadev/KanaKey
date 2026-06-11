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
    expect(romajiToKana('maccha')).toBe('まっちゃ')
  })

  it('keeps the second n when it can start an n-row kana', () => {
    expect(romajiToKana('konnichiha')).toBe('こんにちは')
    expect(romajiToKana('konna')).toBe('こんな')
    expect(romajiToKana('onna')).toBe('おんな')
  })

  it('keeps the second n before y so ny* digraphs still work', () => {
    expect(romajiToKana('shinnyu')).toBe('しんにゅ')
  })

  it('consumes both n characters when nn is just explicit ん before another consonant', () => {
    expect(romajiToKana('nnka')).toBe('んか')
    expect(romajiToKana('nnshi')).toBe('んし')
  })

  it('uses apostrophe to force ん before vowel or y sounds', () => {
    expect(romajiToKana("on'a")).toBe('おんあ')
    expect(romajiToKana("kin'youbi")).toBe('きんようび')
  })

  it('converts n before consonants such as nka to んか', () => {
    expect(romajiToKana('nka')).toBe('んか')
    expect(romajiToKana('kenka')).toBe('けんか')
  })

  it('leaves unfinished romaji visible where expected', () => {
    expect(romajiToKana('k')).toBe('k')
    expect(romajiToKana('ak')).toBe('あk')
    expect(romajiToKana('ny')).toBe('ny')
    expect(romajiToKana('kan')).toBe('かn')
  })
})
