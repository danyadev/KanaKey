import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import { usePracticeStore } from '../../stores/practiceStore'
import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel component behavior', () => {
  it('changes batch size through the store action', async () => {
    const { store, wrapper } = mountSettingsPanel()
    const input = wrapper.find('input[type="number"]')

    await input.setValue('12')

    expect(store.settings.batchSize).toBe(12)
  })

  it('switches mode through the store action', async () => {
    const { store, wrapper } = mountSettingsPanel()

    await wrapper.findAll('button').find((button) => button.text() === 'Katakana')!.trigger('click')
    expect(store.settings.mode).toBe('katakana')

    await wrapper.findAll('button').find((button) => button.text() === 'Mixed')!.trigger('click')
    expect(store.settings.mode).toBe('mixed')
  })

  it('toggling word separator updates boolean showWordSeparator', async () => {
    const { store, wrapper } = mountSettingsPanel()
    const checkbox = wrapper.find('input[type="checkbox"]')

    await checkbox.setValue(false)

    expect(store.settings.showWordSeparator).toBe(false)
  })

  it('changing font updates kana font choice', async () => {
    const { store, wrapper } = mountSettingsPanel()

    await wrapper.find('select').setValue('mincho')

    expect(store.kanaFont).toBe('mincho')
  })
})

function mountSettingsPanel() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePracticeStore()
  store.initialize({ keyValueStorage: createMapStorage(), words: [{ script: 'hiragana', kana: 'あい', meaning: 'あい', jlpt: 'N5' }] })

  return {
    store,
    wrapper: mount(SettingsPanel, { global: { plugins: [pinia] } }),
  }
}

function createMapStorage() {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  }
}
