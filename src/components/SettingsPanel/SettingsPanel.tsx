import { defineComponent } from 'vue'

import type { PracticeSettings } from '../../model/settings'
import type { KanaFontChoice } from '../../storage/kanaFontStorage'
import './SettingsPanel.css'

type SettingsPanelProps = {
  settings: PracticeSettings
  accuracyPercent: number
  kanaFont: KanaFontChoice
}

type SettingsPanelEmits = {
  'update:settings': (patch: Partial<PracticeSettings>) => void
  'update:kanaFont': (font: KanaFontChoice) => void
  resetProgress: () => void
}

export const SettingsPanel = defineComponent<SettingsPanelProps, SettingsPanelEmits>((props, ctx) => {
  function updateSettings(patch: Partial<PracticeSettings>) {
    ctx.emit('update:settings', patch)
  }

  function resetProgress(event: Event) {
    event.preventDefault()
    event.stopPropagation()
    ctx.emit('resetProgress')
  }

  return () => (
    <aside class="panel settings-panel">
      <p class="eyebrow">Session controls</p>

      <div class="mode-switch" aria-label="Practice mode">
        <ModeButton mode="hiragana" settings={props.settings} onSelect={updateSettings} />
        <ModeButton mode="katakana" settings={props.settings} onSelect={updateSettings} />
        <ModeButton mode="mixed" settings={props.settings} onSelect={updateSettings} />
      </div>

      <div class="quick-settings">
        <label>
          Batch size
          <input
            value={props.settings.batchSize}
            type="number"
            min="1"
            max="50"
            onChange={(event) => updateSettings({ batchSize: readNumber(event) })}
          />
        </label>

        <label class="check">
          <input
            checked={props.settings.showWordSeparator}
            type="checkbox"
            onChange={(event) => updateSettings({ showWordSeparator: readChecked(event) })}
          />
          Show word separator
        </label>

        <label>
          Kana font
          <select
            value={props.kanaFont}
            onChange={(event) => ctx.emit('update:kanaFont', readKanaFont(event))}
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
            value={props.settings.targetKpm}
            min="1"
            max="400"
            onChange={(value) => updateSettings({ targetKpm: value })}
          />
          <NumberSetting
            label="Accuracy goal %"
            value={props.accuracyPercent}
            min="50"
            max="100"
            onChange={(value) => updateSettings({ targetAccuracy: value / 100 })}
          />
          <NumberSetting
            label="Daily practice goal minutes"
            value={props.settings.dailyPracticeMinutesGoal}
            min="1"
            max="240"
            onChange={(value) => updateSettings({ dailyPracticeMinutesGoal: value })}
          />
          <NumberSetting
            label="Smoothing appearances"
            value={props.settings.smoothingAppearanceCount}
            min="1"
            max="500"
            onChange={(value) => updateSettings({ smoothingAppearanceCount: value })}
          />
        </div>
      </details>
    </aside>
  )
}, {
  props: ['settings', 'accuracyPercent', 'kanaFont'],
  emits: ['update:settings', 'update:kanaFont', 'resetProgress'],
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
