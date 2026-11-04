export type ImportWorkflowStep = 1 | 2 | 3 | 4;

export type SingleImportWorkflowState = {
  hasFile: boolean;
  hasReviewData: boolean;
  hasColumnMapping: boolean;
  hasBackgroundJob: boolean;
  loading: boolean;
};

export function resolveInitialSingleImportStep(state: SingleImportWorkflowState): ImportWorkflowStep {
  if (state.hasBackgroundJob) return 4;
  return state.hasFile && state.hasReviewData ? 3 : 1;
}

/** A restored server job owns its status step independently of the original browser File. */
export function reconcileSingleImportStep(
  currentStep: ImportWorkflowStep,
  state: SingleImportWorkflowState,
): ImportWorkflowStep {
  if (state.hasBackgroundJob) return 4;
  if (!state.hasFile) return 1;
  if (state.loading) return 4;
  if (currentStep !== 1) return currentStep;
  if (state.hasColumnMapping) return 2;
  return state.hasReviewData ? 3 : currentStep;
}

export function isSingleImportStepAvailable(
  step: ImportWorkflowStep,
  state: SingleImportWorkflowState,
): boolean {
  if (step === 1) return true;
  if (step === 4 && state.hasBackgroundJob) return true;
  if (step === 2) return state.hasFile && state.hasColumnMapping;
  return state.hasFile && state.hasReviewData;
}

export function getPreviousSingleImportStep(
  currentStep: ImportWorkflowStep,
  state: SingleImportWorkflowState,
): ImportWorkflowStep {
  if (currentStep === 4 && isSingleImportStepAvailable(3, state)) return 3;
  if (currentStep === 3 && isSingleImportStepAvailable(2, state)) return 2;
  return 1;
}
