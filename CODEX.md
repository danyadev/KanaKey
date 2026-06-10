# KanaKey Development Guide

This guide preserves the product and engineering context needed to continue work consistently across sessions.
Treat it as the source of truth for the app’s mechanics, UI direction, and implementation expectations.

## Product

KanaKey is a compact Japanese kana typing trainer inspired by keybr.

It teaches kana through real kana words. The app unlocks kana gradually, generates real word batches
around the current target kana, measures typing stability, and returns to weak kana when needed.

## Progression

Kana unlock order is custom, not alphabetical/gojūon order.

Initial unlocked kana count is fixed at 5 for each mode.

The progression line should be designed around word availability:
early unlock steps should allow enough unique real-word practice for the default batch size.
Some later sparse kana in the current seed list do not have enough unique words yet; for those kana,
normal practice duplicates eligible real words until the word list is expanded.

Hiragana and katakana characters are separate units, so あ and ア have separate stats.
Mixed mode practices both scripts and updates the same shared per-kana stats depending on which characters appear in the batch.

## Batch Generation

A generated practice word must satisfy both rules:
1. it contains the current target kana
2. it uses only unlocked kana

Default batch size should be coverable with unique real words for the common early progression path.

If the user sets a batch size larger than the available unique eligible words, duplicate eligible words and shuffle the batch.

## Practice Flow

choose current target kana
→ generate eligible real-word batch
→ user types with Japanese IME
→ evaluate speed and accuracy
→ update target kana stats
→ choose next weak/unpassed kana
→ unlock next kana when current unlocked set is stable

## Passing Metrics

A kana passes when its smoothed recent stats meet all configured goals:
- smoothed kpm >= speed goal
- smoothed accuracy >= accuracy goal
- appearances >= required appearance count

Smoothing uses the latest per-kana attempt records until they cover at least 20 appearances.
If fewer records exist, use all available data.

Store historical per-kana metrics so the app can show speed and accuracy graphs over attempts:
- appearance count: how many times this kana appeared in an attempt
- correct count: how many of those appearances were typed correctly
- allocated time: precise time spent on this kana in an attempt
- attempt number: so metrics can be synchronized between kanas

## Practice Time

Track:
- time spent today
- time spent overall
- daily practice time goal

Goals should be editable.

## UI Direction

The UI should feel like a compact daily training tool.

Style direction: minimal, card-based, warm but subtle, keyboard-focused.

## Architecture

Component style:
```tsx
export const ComponentName = defineComponent<Props>((props) => {
  return () => (
    <div>{props.msg}</div>
  )
}, { props: ['msg'] })
```

Pinia is allowed if it makes settings, progress, sessions, or time tracking cleaner.

Trainer logic should stay pure and testable even if state moves to Pinia.

## Persistence

Persist in localStorage:
- settings
- progress
- session history
- practice time

Stored data should be normalized on load for the current storage version.

## Input Surface

Practice input should behave like a keybr-style typing surface, not a visible textarea.

Use a hidden real input for IME capture. Render target words as the visible typing UI.

- words are separated by an optional centered dot separator
- separator is visual only, not required to input
- completed kana have muted color
- future kana stay readable
- current kana has a caret underline
- wrong input marks the required current kana red until it's written correctly

During IME composition:

- show composition text above the current kana as a small bubble (rectangle-ish)
- treat composition as preview-only until committed

When a word is completed, record word timing. When the batch is completed, auto-submit the attempt.

This model should support future per-kana timing from committed kana-unit boundaries.

## Testing

Non-UI tests should cover learning logic, progression, batch generation, metrics, persistence normalization, and other pure behavior.

UI tests should cover runtime-critical behavior:
typing, IME composition, auto-submit, settings changes, focus behavior, and visible goal/progress updates.

Prefer behavior tests over snapshots. Add or update tests when changing mechanics.

## Guide Maintenance

When a requested change conflicts with this guide, update the guide together with the code.
