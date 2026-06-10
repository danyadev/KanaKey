import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

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

  it('resets progress without opening the goals panel', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const { store, wrapper } = mountSettingsPanel()
    store.progress.kanaStats['あ'].appearances = 4
    const resetButton = wrapper.find('summary .danger')

    await resetButton.trigger('click')

    expect(store.progress.kanaStats['あ'].appearances).toBe(0)
    expect(wrapper.find('details.advanced-settings').attributes('open')).toBeUndefined()
  })

  it('keeps the goals panel closed by default', () => {
    const { wrapper } = mountSettingsPanel()

    expect(wrapper.find('details.advanced-settings').attributes('open')).toBeUndefined()
  })

  it('keeps reset progress aligned in the goals header', () => {
    const { wrapper } = mountSettingsPanel()
    const summary = wrapper.find('details.advanced-settings > summary')

    expect(summary.find('span').text()).toBe('Goals')
    expect(summary.find('button.danger').text()).toBe('Reset progress')
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
