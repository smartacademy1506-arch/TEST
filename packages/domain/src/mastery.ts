/**
 * Indicateur de travail (CDC PED-04). Ce n'est PAS une probabilité de réussite au concours.
 * Il n'existe volontairement aucun libellé « maîtrisé » : 0,8 après cinq essais ne prouve rien.
 */
export const EMA_PREVIOUS_WEIGHT = 0.7;
export const EMA_NEW_WEIGHT = 0.3;

/** Hypothèses de départ à calibrer avec le psychométricien (CDC PED-04). */
export const DEFAULT_MASTERY_CONFIG = {
  minDistinctQuestions: 5,
  toWorkBelow: 0.5,
  inProgressBelow: 0.75,
} as const;

export interface MasteryState {
  /** Moyenne mobile exponentielle dans [0, 1] ; null tant qu'il n'y a aucune observation. */
  value: number | null;
  /** Questions distinctes observées (les répétitions ne gonflent pas ce décompte). */
  distinctQuestionIds: string[];
}

export type MasteryKind = 'not_evaluated' | 'to_confirm' | 'to_work' | 'in_progress' | 'encouraging';

export interface MasteryLabel {
  kind: MasteryKind;
  distinctQuestions: number;
}

export const emptyMastery = (): MasteryState => ({ value: null, distinctQuestionIds: [] });

/**
 * `independent=false` pour une remédiation faite juste après la lecture du corrigé :
 * elle ne compte pas comme preuve indépendante et ne modifie rien.
 */
export function observe(
  state: MasteryState,
  questionId: string,
  correct: boolean,
  independent = true,
): MasteryState {
  if (!independent) return state;
  const result = correct ? 1 : 0;
  const value =
    state.value === null ? result : EMA_PREVIOUS_WEIGHT * state.value + EMA_NEW_WEIGHT * result;
  const distinct = state.distinctQuestionIds.includes(questionId)
    ? state.distinctQuestionIds
    : [...state.distinctQuestionIds, questionId];
  return { value, distinctQuestionIds: distinct };
}

export function masteryLabel(
  state: MasteryState,
  cfg: typeof DEFAULT_MASTERY_CONFIG = DEFAULT_MASTERY_CONFIG,
): MasteryLabel {
  const distinctQuestions = state.distinctQuestionIds.length;
  if (state.value === null || distinctQuestions === 0) return { kind: 'not_evaluated', distinctQuestions };
  if (distinctQuestions < cfg.minDistinctQuestions) return { kind: 'to_confirm', distinctQuestions };
  if (state.value < cfg.toWorkBelow) return { kind: 'to_work', distinctQuestions };
  if (state.value < cfg.inProgressBelow) return { kind: 'in_progress', distinctQuestions };
  return { kind: 'encouraging', distinctQuestions };
}
