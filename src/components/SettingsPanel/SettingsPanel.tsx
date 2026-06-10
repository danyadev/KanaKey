import { defineComponent } from 'vue'

import type { KanaFontChoice } from '../App/uiPrefs'
import type { PracticeSettings } from '../../types'
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
  return () => (
    <aside class="panel settings-panel">
      <p class="eyebrow">Session controls</p>
      <div class="mode-switch" aria-label="Practice mode">
        <button type="button" class={{ active: props.settings.mode === 'hiragana' }} onClick={() => updateSettings(ctx, { mode: 'hiragana' })}>Hiragana</button>
        <button type="button" class={{ active: props.settings.mode === 'katakana' }} onClick={() => updateSettings(ctx, { mode: 'katakana' })}>Katakana</button>
        <button type="button" class={{ active: props.settings.mode === 'mixed' }} onClick={() => updateSettings(ctx, { mode: 'mixed' })}>Mixed</button>
      </div>

      <div class="quick-settings">
        <label>
          Batch size
          <input value={props.settings.batchSize} type="number" min="1" max="50" onChange={(event) => updateSettings(ctx, { batchSize: readNumber(event) })} />
        </label>
        <label class="check">
          <input checked={props.settings.showWordSeparator} type="checkbox" onChange={(event) => updateSettings(ctx, { showWordSeparator: readChecked(event) })} />
          Show word separator
        </label>
        <label>
          Kana font
          <select value={props.kanaFont} onChange={(event) => ctx.emit('update:kanaFont', readKanaFont(event))}>
            <option value="gothic">Gothic</option>
            <option value="system">System sans</option>
            <option value="mincho">Mincho</option>
          </select>
        </label>
      </div>

      <details class="advanced-settings">
        <summary>
          <span>Goals</span>
          <button type="button" class="danger" onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            ctx.emit('resetProgress')
          }}>Reset progress</button>
        </summary>
        <div class="advanced-grid">
          <label>
            Speed goal kana/min
            <input value={props.settings.targetKpm} type="number" min="1" max="400" onChange={(event) => updateSettings(ctx, { targetKpm: readNumber(event) })} />
          </label>
          <label>
            Accuracy goal %
            <input value={props.accuracyPercent} type="number" min="50" max="100" onChange={(event) => updateSettings(ctx, { targetAccuracy: readNumber(event) / 100 })} />
          </label>
          <label>
            Required appearances
            <input value={props.settings.requiredAppearanceCount} type="number" min="1" max="500" onChange={(event) => updateSettings(ctx, { requiredAppearanceCount: readNumber(event) })} />
          </label>
          <label>
            Daily practice goal minutes
            <input value={props.settings.dailyPracticeMinutesGoal} type="number" min="1" max="240" onChange={(event) => updateSettings(ctx, { dailyPracticeMinutesGoal: readNumber(event) })} />
          </label>
          <label>
            Smoothing appearances
            <input value={props.settings.smoothingAppearanceCount} type="number" min="1" max="500" onChange={(event) => updateSettings(ctx, { smoothingAppearanceCount: readNumber(event) })} />
          </label>
        </div>
      </details>
    </aside>
  )
}, {
  props: ['settings', 'accuracyPercent', 'kanaFont'],
  emits: ['update:settings', 'update:kanaFont', 'resetProgress'],
})

function updateSettings(ctx: { emit: (event: 'update:settings', patch: Partial<PracticeSettings>) => void }, patch: Partial<PracticeSettings>) {
  ctx.emit('update:settings', patch)
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
