import { defineComponent } from 'vue'

import type { PracticeSettings } from '../../types'
import './SettingsPanel.css'

type SettingsPanelProps = {
  settings: PracticeSettings
  accuracyPercent: number
  updateSettings: (patch: Partial<PracticeSettings>) => void
  setAccuracyPercent: (value: number) => void
  resetProgress: () => void
}

export const SettingsPanel = defineComponent<SettingsPanelProps>((props, _ctx) => {
  return () => (
    <aside class="panel settings-panel">
      <p class="eyebrow">Session controls</p>
      <div class="mode-switch" aria-label="Practice mode">
        <button type="button" class={{ active: props.settings.mode === 'hiragana' }} onClick={() => props.updateSettings({ mode: 'hiragana' })}>Hiragana</button>
        <button type="button" class={{ active: props.settings.mode === 'katakana' }} onClick={() => props.updateSettings({ mode: 'katakana' })}>Katakana</button>
        <button type="button" class={{ active: props.settings.mode === 'mixed' }} onClick={() => props.updateSettings({ mode: 'mixed' })}>Mixed</button>
      </div>

      <div class="quick-settings">
        <label>
          Batch size
          <input value={props.settings.batchSize} type="number" min="1" max="50" onInput={(event) => props.updateSettings({ batchSize: readNumber(event) })} />
        </label>
        <label class="check">
          <input checked={props.settings.doubleWords} type="checkbox" onChange={(event) => props.updateSettings({ doubleWords: readChecked(event) })} />
          Double every word
        </label>
        <label class="check">
          <input checked={props.settings.shuffleDoubledWords} type="checkbox" disabled={!props.settings.doubleWords} onChange={(event) => props.updateSettings({ shuffleDoubledWords: readChecked(event) })} />
          Shuffle doubled words
        </label>
      </div>

      <details class="advanced-settings">
        <summary>Advanced targets</summary>
        <div class="advanced-grid">
          <label>
            Target kana/min
            <input value={props.settings.targetKpm} type="number" min="1" max="400" onInput={(event) => props.updateSettings({ targetKpm: readNumber(event) })} />
          </label>
          <label>
            Target accuracy %
            <input value={props.accuracyPercent} type="number" min="50" max="100" onInput={(event) => props.setAccuracyPercent(readNumber(event))} />
          </label>
          <label>
            Initial unlocked kana on reset
            <input value={props.settings.initialUnlockedCount} type="number" min="1" max="160" onInput={(event) => props.updateSettings({ initialUnlockedCount: readNumber(event) })} />
          </label>
          <label>
            Minimum attempts per kana
            <input value={props.settings.minAttemptsPerKana} type="number" min="1" max="20" onInput={(event) => props.updateSettings({ minAttemptsPerKana: readNumber(event) })} />
          </label>
          <label>
            Smoothing window
            <input value={props.settings.smoothingWindow} type="number" min="1" max="20" onInput={(event) => props.updateSettings({ smoothingWindow: readNumber(event) })} />
          </label>
        </div>
      </details>

      <button type="button" class="danger" onClick={props.resetProgress}>Reset progress</button>
    </aside>
  )
}, {
  props: ['settings', 'accuracyPercent', 'updateSettings', 'setAccuracyPercent', 'resetProgress'],
})

function readNumber(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function readChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}
