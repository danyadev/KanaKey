# KanaKey

KanaKey is a compact Japanese kana typing trainer. It teaches kana through real-word batches, tracks per-kana progress, and supports IME-first typing with a keybr-style input surface.

## Scripts

- `yarn dev` - start Vite dev server
- `yarn test` - run Vitest behavior tests
- `yarn build` - type-check and build production assets
- `yarn import:words` - import word data from the project word-import script

## Architecture

- `src/model/` contains pure domain logic: batch generation, progress transitions, settings normalization, evaluation, kana utilities, and input-surface transitions.
- `src/stores/practiceStore.ts` is the Pinia session/controller layer. It orchestrates model functions, storage, and UI-facing state.
- `src/storage/` contains small key-value storage adapters for settings, progress, and UI preferences.
- `src/session/` contains message formatting and view-model helpers that sit between model data and UI props.
- `src/components/` contains mostly presentational Vue TSX components.
