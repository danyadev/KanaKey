import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

import { App } from './App'

describe('App session behavior', () => {
  it('switching mode regenerates the visible practice batch', async () => {
    installLocalStorage()
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(App, {
      global: { plugins: [pinia] },
    })

    await wrapper.findAll('button').find((button) => button.text() === 'Katakana')!.trigger('click')

    expect(wrapper.find('.typing-surface').text()).toContain('ス')
  })
})

function installLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
  })
}
