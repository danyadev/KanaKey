import { defineComponent } from 'vue'
import { storeToRefs } from 'pinia'

import type { PracticeSettings } from '../../model/settings'
import { usePracticeStore } from '../../stores/practiceStore'
import type { KanaFontChoice } from '../../storage/kanaFontStorage'
import './SettingsPanel.css'

export const SettingsPanel = defineComponent(() => {
  const store = usePracticeStore()
  const { accuracyPercent, kanaFont, settings } = storeToRefs(store)

  function updateSettings(patch: Partial<PracticeSettings>) {
    store.updateSettings(patch)
  }

  function resetProgress(event: Event) {
    event.preventDefault()
    event.stopPropagation()
    if (!confirm('Reset all KanaKey progress? Settings will be kept.')) return
    store.resetProgress()
  }

  return () => (
    <aside class="panel settings-panel">
      <p class="eyebrow">Session controls</p>

      <div class="mode-switch" aria-label="Practice mode">
        <ModeButton mode="hiragana" settings={settings.value} onSelect={updateSettings} />
        <ModeButton mode="katakana" settings={settings.value} onSelect={updateSettings} />
        <ModeButton mode="mixed" settings={settings.value} onSelect={updateSettings} />
      </div>

      <div class="quick-settings">
        <label>
          Batch size
          <input
            value={settings.value.batchSize}
            type="number"
            min="1"
            max="50"
            onChange={(event) => updateSettings({ batchSize: readNumber(event) })}
          />
        </label>

        <label class="check">
          <input
            checked={settings.value.showWordSeparator}
            type="checkbox"
            onChange={(event) => updateSettings({ showWordSeparator: readChecked(event) })}
          />
          Show word separator
        </label>

        <label>
          Kana font
          <select
            value={kanaFont.value}
            onChange={(event) => store.updateKanaFont(readKanaFont(event))}
          >
            <option value="gothic">Gothic</option>
            <option value="system">System sans</option>
            <option value="mincho">Mincho</option>
          </select>
        </label>
      </div>

      <details class="advanced-settings">
        <summary>
          <span>Goals</span>
          <button type="button" class="danger" onClick={resetProgress}>
            Reset progress
          </button>
        </summary>

        <div class="advanced-grid">
          <NumberSetting
            label="Speed goal kana/min"
            value={settings.value.targetKpm}
            min="1"
            max="400"
            onChange={(value) => updateSettings({ targetKpm: value })}
          />
          <NumberSetting
            label="Accuracy goal %"
            value={accuracyPercent.value}
            min="50"
            max="100"
            onChange={(value) => updateSettings({ targetAccuracy: value / 100 })}
          />
          <NumberSetting
            label="Daily practice goal minutes"
            value={settings.value.dailyPracticeMinutesGoal}
            min="1"
            max="240"
            onChange={(value) => updateSettings({ dailyPracticeMinutesGoal: value })}
          />
          <NumberSetting
            label="Smoothing appearances"
            value={settings.value.smoothingAppearanceCount}
            min="1"
            max="500"
            onChange={(value) => updateSettings({ smoothingAppearanceCount: value })}
          />
        </div>
      </details>
    </aside>
  )
})

type ModeButtonProps = {
  mode: PracticeSettings['mode']
  settings: PracticeSettings
  onSelect: (patch: Partial<PracticeSettings>) => void
}

const ModeButton = defineComponent<ModeButtonProps>((props) => {
  return () => (
    <button
      type="button"
      class={{ active: props.settings.mode === props.mode }}
      onClick={() => props.onSelect({ mode: props.mode })}
    >
      {modeLabel(props.mode)}
    </button>
  )
}, {
  props: ['mode', 'settings', 'onSelect'],
})

type NumberSettingProps = {
  label: string
  value: number
  min: string
  max: string
  onChange: (value: number) => void
}

const NumberSetting = defineComponent<NumberSettingProps>((props) => {
  return () => (
    <label>
      {props.label}
      <input
        value={props.value}
        type="number"
        min={props.min}
        max={props.max}
        onChange={(event) => props.onChange(readNumber(event))}
      />
    </label>
  )
}, {
  props: ['label', 'value', 'min', 'max', 'onChange'],
})

function modeLabel(mode: PracticeSettings['mode']): string {
  if (mode === 'hiragana') return 'Hiragana'
  if (mode === 'katakana') return 'Katakana'
  return 'Mixed'
}

function readNumber(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function readChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}

function readKanaFont(event: Event): KanaFontChoice {
  return (event.target as HTMLSelectElement).value as KanaFontChoice
}
