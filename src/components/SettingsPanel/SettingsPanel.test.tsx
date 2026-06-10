import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '../../model/settings'
import type { PracticeSettings } from '../../model/settings'
import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel component behavior', () => {
  it('changes batch size through the settings action', async () => {
    const wrapper = mountSettingsPanel()
    const input = wrapper.find('input[type="number"]')

    await input.setValue('12')

    expect(wrapper.emitted('update:settings')).toEqual([[{ batchSize: 12 }]])
  })

  it('switches mode through the settings action', async () => {
    const wrapper = mountSettingsPanel()

    await wrapper.findAll('button').find((button) => button.text() === 'Hiragana')!.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === 'Katakana')!.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === 'Mixed')!.trigger('click')

    expect(wrapper.emitted('update:settings')).toEqual([
      [{ mode: 'hiragana' }],
      [{ mode: 'katakana' }],
      [{ mode: 'mixed' }],
    ])
  })

  it('toggling word separator emits boolean showWordSeparator', async () => {
    const wrapper = mountSettingsPanel()
    const checkbox = wrapper.find('input[type="checkbox"]')

    await checkbox.setValue(false)

    expect(wrapper.emitted('update:settings')).toEqual([[{ showWordSeparator: false }]])
  })

  it('changing font emits update:kanaFont', async () => {
    const wrapper = mountSettingsPanel()

    await wrapper.find('select').setValue('mincho')

    expect(wrapper.emitted('update:kanaFont')).toEqual([['mincho']])
  })

  it('calls resetProgress without opening the goals panel', async () => {
    const wrapper = mountSettingsPanel()
    const resetButton = wrapper.find('summary .danger')

    await resetButton.trigger('click')

    expect(wrapper.emitted('resetProgress')).toHaveLength(1)
    expect(wrapper.find('details.advanced-settings').attributes('open')).toBeUndefined()
  })

  it('keeps the goals panel closed by default', () => {
    const wrapper = mountSettingsPanel()

    expect(wrapper.find('details.advanced-settings').attributes('open')).toBeUndefined()
  })

  it('keeps reset progress aligned in the goals header', () => {
    const wrapper = mountSettingsPanel()
    const summary = wrapper.find('details.advanced-settings > summary')

    expect(summary.find('span').text()).toBe('Goals')
    expect(summary.find('button.danger').text()).toBe('Reset progress')
  })
})

function mountSettingsPanel(settings: PracticeSettings = DEFAULT_SETTINGS) {
  return mount(SettingsPanel, {
    props: {
      settings,
      accuracyPercent: 95,
      kanaFont: 'gothic',
    },
  })
}
