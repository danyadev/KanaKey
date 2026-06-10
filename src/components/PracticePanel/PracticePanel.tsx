import { defineComponent } from 'vue'
import type { Ref } from 'vue'

import type { BatchEvaluation } from '../../model/evaluation'
import {
  getCurrentWordRemainder,
  shouldHandlePracticeShortcut,
} from '../../model/inputSurface'
import type { SurfaceUnitView, SurfaceWordView } from '../../model/inputSurface'
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
  typingBox: Ref<HTMLTextAreaElement | null>
  currentKana: string
  compositionText: string
  isComposing: boolean
  targetKpm: number
  targetAccuracyPercent: number
  passMeter: PassMeter
  lastEvaluation: BatchEvaluation | null
  outcomeMessage: string | null
}

type PracticePanelEmits = {
  submit: () => void
  clear: () => void
  commitInput: (value: string) => void
  compositionStart: () => void
  compositionUpdate: (value: string) => void
  compositionEnd: (value: string) => void
}

export const PracticePanel = defineComponent<PracticePanelProps, PracticePanelEmits>((props, ctx) => {
  function focusInput() {
    props.typingBox.value?.focus()
  }

  function consumeInput(event: Event) {
    const input = event.target as HTMLTextAreaElement
    if (!props.isComposing && input.value.length > 0) {
      ctx.emit('commitInput', input.value)
      input.value = ''
    }
  }

  function handleCompositionUpdate(event: CompositionEvent) {
    const input = event.target as HTMLTextAreaElement
    const compositionText = event.data || input.value
    const remainder = getCurrentWordRemainder(props.surfaceWords)

    if (compositionText && compositionText === remainder) {
      ctx.emit('compositionEnd', compositionText)
      input.value = ''
      return
    }

    ctx.emit('compositionUpdate', compositionText)
  }

  function handleCompositionEnd(event: CompositionEvent) {
    const input = event.target as HTMLTextAreaElement
    const committed = event.data || input.value
    ctx.emit('compositionEnd', committed)
    input.value = ''
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!shouldHandlePracticeShortcut(event, props.isComposing)) return

    if (event.key === 'Escape') {
      event.preventDefault()
      ctx.emit('clear')
      return
    }

    event.preventDefault()
    ctx.emit('submit')
  }

  function renderImeInput() {
    return (
      <textarea
        ref={props.typingBox}
        value=""
        class={['hidden-ime-input', { composing: props.isComposing }]}
        spellcheck={false}
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        onInput={consumeInput}
        onCompositionstart={() => ctx.emit('compositionStart')}
        onCompositionupdate={handleCompositionUpdate}
        onCompositionend={handleCompositionEnd}
        onKeydown={handleKeydown}
      />
    )
  }

  function renderKanaUnit(unit: SurfaceUnitView) {
    return (
      <span key={unit.globalIndex} class={['surface-kana', unit.status, { wrong: unit.wrong }]}>
        {renderCompositionBubble(unit)}
        {unit.kana}
        {unit.status === 'current' && renderImeInput()}
      </span>
    )
  }

  function renderCompositionBubble(unit: SurfaceUnitView) {
    if (unit.status !== 'current' || !props.isComposing || !props.compositionText) return null
    return <span class="composition-bubble">{props.compositionText}</span>
  }

  function renderWord(word: SurfaceWordView, wordIndex: number) {
    return (
      <span key={`${word.word}-${word.index}`} class="surface-word">
        {word.units.map(renderKanaUnit)}
        {renderSeparator(wordIndex)}
      </span>
    )
  }

  function renderSeparator(wordIndex: number) {
    const isLastWord = wordIndex >= props.surfaceWords.length - 1
    if (!props.showWordSeparator || isLastWord) return null
    return <span class="visual-separator" aria-hidden="true">·</span>
  }

  return () => (
    <article class="practice panel">
      <div class="practice-topline">
        <p class="eyebrow">Practice line</p>
      </div>

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
        {props.surfaceWords.map(renderWord)}
        {props.surfaceWords.length === 0 && (
          <span class="target-empty">No eligible real words yet</span>
        )}
      </div>

      {props.warningMessages.map((message) => (
        <p key={message} class="warning">{message}</p>
      ))}

      {props.lastEvaluation && <ResultStrip evaluation={props.lastEvaluation} />}
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
    'compositionText',
    'isComposing',
    'targetKpm',
    'targetAccuracyPercent',
    'passMeter',
    'lastEvaluation',
    'outcomeMessage',
  ],
  emits: ['submit', 'clear', 'commitInput', 'compositionStart', 'compositionUpdate', 'compositionEnd'],
})

type ResultStripProps = {
  evaluation: BatchEvaluation
}

const ResultStrip = defineComponent<ResultStripProps>((props) => {
  return () => (
    <div class="result-strip">
      <span>Speed <strong>{Math.round(props.evaluation.kpm)}</strong> kana/min</span>
      <span>Accuracy <strong>{Math.round(props.evaluation.accuracy * 100)}</strong>%</span>
      <span>
        Correct <strong>{props.evaluation.correctKanaCount}/{props.evaluation.totalExpectedKana}</strong>
      </span>
    </div>
  )
}, {
  props: ['evaluation'],
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
