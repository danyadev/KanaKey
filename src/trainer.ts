export {
  buildEvaluation,
  evaluateBatch,
  expectedText,
  JAPANESE_SPACE,
  normalizeTypedText,
} from './evaluation'

export {
  DEFAULT_SETTINGS,
  INITIAL_UNLOCKED_COUNT,
  REQUIRED_APPEARANCE_COUNT,
  STORAGE_VERSION,
  isPracticeMode,
  normalizeSettings,
  settingsAffectPassState,
} from './settings'

export {
  addPracticeTime,
  advanceTargetsAfterAttempt,
  applyEvaluationToProgress,
  chooseNextTargetKana,
  createEmptyKanaStats,
  createInitialProgress,
  ensureProgress,
  getSmoothingAttempts,
  getUnlockedKana,
  isKanaPassed,
  normalizePracticeTime,
  progressSummary,
  refreshProgressPassFlags,
  refreshSmoothedStats,
} from './progress'

export {
  formatBatchWarning,
  generateBatch,
  getEligibleTargetWords,
} from './batch'
