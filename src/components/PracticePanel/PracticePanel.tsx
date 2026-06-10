import { computed, defineComponent, shallowRef } from 'vue'
import type { Ref } from 'vue'

import type { BatchEvaluation } from '../../model/evaluation'
import { getCurrentWordRemainder } from '../../model/inputSurface'
import type { SurfaceUnitView, SurfaceWordView } from '../../model/inputSurface'
import { getLastRomaji, romajiToKana } from '../../model/kana'
import './PracticePanel.css'

export type PassMeter = {
  kpm: number
  accuracy: number
  kpmPercent: number
  accuracyPercent: number
}

type PracticePanelProps = {
  surfaceWords: SurfaceWordView[]
  showWordSeparator: boolean
  warningMessages: string[]
  typingBox: Ref<HTMLInputElement | null>
  currentKana: string
  targetKpm: number
  targetAccuracyPercent: number
  passMeter: PassMeter
  lastEvaluation: BatchEvaluation | null
  outcomeMessage: string | null
  commitInput: (value: string) => void
}

export const PracticePanel = defineComponent<PracticePanelProps>((props) => {
  const composingText = shallowRef('')
  const composingKana = computed(() => romajiToKana(composingText.value))
  const isComposing = shallowRef(false)

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Backspace') {
      const lastRomaji = getLastRomaji(composingText.value)
      composingText.value = composingText.value.slice(0, lastRomaji ? -lastRomaji.length : -1)
      event.preventDefault()
      return
    }

    if (event.key === 'Enter' && !event.isComposing) {
      submitComposedText(composingKana.value)
      event.preventDefault()
      return
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    event.preventDefault()

    if (event.key.length === 1 && (event.key >= 'a' && event.key <= 'z' || event.key >= 'A' && event.key <= 'Z')) {
      composingText.value += event.key

      // IME doesn't automatically replace 'n' at the end while composing,
      // but we still want to automatically submit words like さん
      const kanaText = event.key.toLowerCase() === 'n'
        ? composingKana.value.slice(0, -1) + 'ん'
        : composingKana.value

      if (kanaText === getCurrentWordRemainder(props.surfaceWords)) {
        submitComposedText(kanaText)
      }
    }
  }

  const onCompositionStart = () => {
    isComposing.value = true
  }

  const onCompositionEnd = () => {
    isComposing.value = false
    submitComposedText(composingKana.value)
  }

  const submitComposedText = (kanaText: string) => {
    const input = props.typingBox.value
    if (!input || kanaText.length === 0) return

    props.commitInput(kanaText)
    composingText.value = ''
    input.value = ''
  }

  const focusInput = () => {
    props.typingBox.value?.focus()
  }

  const renderImeInput = () => (
    <input
      ref={props.typingBox}
      type="text"
      class={['hidden-ime-input', { composing: isComposing.value }]}
      spellcheck={false}
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      onKeydown={onKeydown}
      onCompositionstart={onCompositionStart}
      onCompositionend={onCompositionEnd}
    />
  )

  const renderKanaUnit = (unit: SurfaceUnitView) => (
    <span key={unit.globalIndex} class={['surface-kana', unit.status, { wrong: unit.wrong }]}>
      {unit.status === 'current' && composingKana.value && (
        <span class="composition-bubble">{composingKana.value}</span>
      )}
      {unit.kana}
      {unit.status === 'current' && renderImeInput()}
    </span>
  )

  return () => (
    <article class="practice panel">
      <p class="eyebrow">Practice line</p>

      <div class="pass-card">
        <div class="pass-card-head">
          <span class="eyebrow">Current kana meter</span>
          <strong class="kana-display">{props.currentKana}</strong>
        </div>
        <MeterRow
          label="KPM"
          width={props.passMeter.kpmPercent}
          value={`${props.passMeter.kpm} / ${props.targetKpm}`}
        />
        <MeterRow
          label="Accuracy"
          width={props.passMeter.accuracyPercent}
          value={`${props.passMeter.accuracy}% / ${props.targetAccuracyPercent}%`}
        />
      </div>

      <div class="typing-surface kana-display" aria-label="Current practice words" onClick={focusInput}>
        {props.surfaceWords.length === 0 && <span class="target-empty">No eligible real words yet</span>}

        {props.surfaceWords.map((word, index) => (
          <span key={`${word.word}-${word.index}`} class="surface-word">
            {word.units.map(renderKanaUnit)}
            {props.showWordSeparator && (index < props.surfaceWords.length - 1) && (
              <span class="visual-separator">·</span>
            )}
          </span>
        ))}
      </div>

      {props.warningMessages.map((message) => (
        <p key={message} class="warning">{message}</p>
      ))}

      {props.lastEvaluation && (
        <div class="result-strip">
          <span>Speed <strong>{Math.round(props.lastEvaluation.kpm)}</strong> kana/min</span>
          <span>Accuracy <strong>{Math.round(props.lastEvaluation.accuracy * 100)}</strong>%</span>
          <span>
            Correct <strong>{props.lastEvaluation.correctKanaCount}/{props.lastEvaluation.totalExpectedKana}</strong>
          </span>
        </div>
      )}
      {props.outcomeMessage && <p class="outcome">{props.outcomeMessage}</p>}
    </article>
  )
}, {
  props: [
    'surfaceWords',
    'showWordSeparator',
    'warningMessages',
    'typingBox',
    'currentKana',
    'targetKpm',
    'targetAccuracyPercent',
    'passMeter',
    'lastEvaluation',
    'outcomeMessage',
    'commitInput',
  ],
})

type MeterRowProps = {
  label: string
  width: number
  value: string
}

const MeterRow = defineComponent<MeterRowProps>((props) => {
  return () => (
    <div class="meter-row">
      <span>{props.label}</span>
      <div class="meter"><i style={{ width: `${props.width}%` }} /></div>
      <b>{props.value}</b>
    </div>
  )
}, {
  props: ['label', 'width', 'value'],
})
