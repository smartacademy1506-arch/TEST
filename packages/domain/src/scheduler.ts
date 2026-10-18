import { addDays, type PedagogicDay } from './days';

/** CDC PED-02 : cinq boîtes de révision, délais initiaux 1, 2, 4, 7 et 14 jours. */
export const BOX_INTERVALS_DAYS = [1, 2, 4, 7, 14] as const;
/** Avant une date d'examen CONFIRMÉE, la prochaine échéance est plafonnée à J-2. */
export const EXAM_CAP_LEAD_DAYS = 2;

/** 0 = jamais vu ; 1..5 = boîtes de révision. */
export type Box = 0 | 1 | 2 | 3 | 4 | 5;

export interface ReviewState {
  questionId: string;
  box: Box;
  /** Jour pédagogique de la prochaine révision ; null tant que l'item n'a jamais été répondu. */
  dueOn: PedagogicDay | null;
}

export interface ExamDate {
  day: PedagogicDay;
  /** Une date non confirmée ne plafonne rien et ne déclenche aucun compte à rebours (EXM-01). */
  confirmed: boolean;
}

export function newReviewState(questionId: string): ReviewState {
  return { questionId, box: 0, dueOn: null };
}

export function intervalDays(box: Exclude<Box, 0>): number {
  return BOX_INTERVALS_DAYS[box - 1] as number;
}

/**
 * Première réponse fausse → boîte 1 ; première réponse juste → boîte 2 ;
 * réponse juste ultérieure → boîte suivante (plafond 5) ; réponse fausse → retour en boîte 1.
 */
export function nextBox(box: Box, correct: boolean): Exclude<Box, 0> {
  if (!correct) return 1;
  if (box === 0) return 2;
  return Math.min(5, box + 1) as Exclude<Box, 0>;
}

/** À partir de J-2 (date confirmée), le mode consolidation remplace les rappels immédiats. */
export function inConsolidation(today: PedagogicDay, exam?: ExamDate): boolean {
  if (!exam?.confirmed) return false;
  return addDays(exam.day, -EXAM_CAP_LEAD_DAYS) <= today;
}

export function applyAnswer(
  state: ReviewState,
  correct: boolean,
  today: PedagogicDay,
  exam?: ExamDate,
): ReviewState {
  const box = nextBox(state.box, correct);
  let dueOn = addDays(today, intervalDays(box));
  if (exam?.confirmed) {
    const cap = addDays(exam.day, -EXAM_CAP_LEAD_DAYS);
    // Plafond seulement tant que J-2 est encore dans le futur ; ensuite : consolidation volontaire.
    if (cap > today && dueOn > cap) dueOn = cap;
  }
  return { questionId: state.questionId, box, dueOn };
}

/** Une révision en retard reste due : elle n'est jamais considérée automatiquement comme échouée. */
export function isDue(state: ReviewState, today: PedagogicDay): boolean {
  return state.box > 0 && state.dueOn !== null && state.dueOn <= today;
}
