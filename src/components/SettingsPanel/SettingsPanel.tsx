import { defineComponent } from 'vue'

import type { PracticeMode } from '../../types'
import './SettingsPanel.css'

type SettingsPanelProps = {
  mode: PracticeMode
  batchSize: number
  doubleWords: boolean
  shuffleDoubledWords: boolean
  targetKpm: number
  accuracyPercent: number
  initialUnlockedCount: number
  minAttemptsPerKana: number
  smoothingWindow: number
  setMode: (mode: PracticeMode) => void
  setBatchSize: (value: number) => void
  setDoubleWords: (value: boolean) => void
  setShuffleDoubledWords: (value: boolean) => void
  setTargetKpm: (value: number) => void
  setAccuracyPercent: (value: number) => void
  setInitialUnlockedCount: (value: number) => void
  setMinAttemptsPerKana: (value: number) => void
  setSmoothingWindow: (value: number) => void
  resetProgress: () => void
}

export const SettingsPanel = defineComponent<SettingsPanelProps>((props, _ctx) => {
  return () => (
    <aside class="panel settings-panel">
      <p class="eyebrow">Session controls</p>
      <div class="mode-switch" aria-label="Practice mode">
        <button type="button" class={{ active: props.mode === 'hiragana' }} onClick={() => props.setMode('hiragana')}>Hiragana</button>
        <button type="button" class={{ active: props.mode === 'katakana' }} onClick={() => props.setMode('katakana')}>Katakana</button>
        <button type="button" class={{ active: props.mode === 'mixed' }} onClick={() => props.setMode('mixed')}>Mixed</button>
      </div>

      <div class="quick-settings">
        <label>
          Batch size
          <input value={props.batchSize} type="number" min="1" max="50" onInput={(event) => props.setBatchSize(readNumber(event))} />
        </label>
        <label class="check">
          <input checked={props.doubleWords} type="checkbox" onChange={(event) => props.setDoubleWords(readChecked(event))} />
          Double every word
        </label>
        <label class="check">
          <input checked={props.shuffleDoubledWords} type="checkbox" disabled={!props.doubleWords} onChange={(event) => props.setShuffleDoubledWords(readChecked(event))} />
          Shuffle doubled words
        </label>
      </div>

      <details class="advanced-settings">
        <summary>Advanced targets</summary>
        <div class="advanced-grid">
          <label>
            Target kana/min
            <input value={props.targetKpm} type="number" min="1" max="400" onInput={(event) => props.setTargetKpm(readNumber(event))} />
          </label>
          <label>
            Target accuracy %
            <input value={props.accuracyPercent} type="number" min="50" max="100" onInput={(event) => props.setAccuracyPercent(readNumber(event))} />
          </label>
          <label>
            Initial unlocked kana
            <input value={props.initialUnlockedCount} type="number" min="1" max="160" onInput={(event) => props.setInitialUnlockedCount(readNumber(event))} />
          </label>
          <label>
            Minimum attempts per kana
            <input value={props.minAttemptsPerKana} type="number" min="1" max="20" onInput={(event) => props.setMinAttemptsPerKana(readNumber(event))} />
          </label>
          <label>
            Smoothing window
            <input value={props.smoothingWindow} type="number" min="1" max="20" onInput={(event) => props.setSmoothingWindow(readNumber(event))} />
          </label>
        </div>
      </details>

      <button type="button" class="danger" onClick={props.resetProgress}>Reset progress</button>
    </aside>
  )
}, {
  props: [
    'mode',
    'batchSize',
    'doubleWords',
    'shuffleDoubledWords',
    'targetKpm',
    'accuracyPercent',
    'initialUnlockedCount',
    'minAttemptsPerKana',
    'smoothingWindow',
    'setMode',
    'setBatchSize',
    'setDoubleWords',
    'setShuffleDoubledWords',
    'setTargetKpm',
    'setAccuracyPercent',
    'setInitialUnlockedCount',
    'setMinAttemptsPerKana',
    'setSmoothingWindow',
    'resetProgress',
  ],
})

function readNumber(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function readChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}
