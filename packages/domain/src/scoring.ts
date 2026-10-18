/** Le score officiel est TOUJOURS recalculé côté serveur depuis les réponses finales (CDC ASM-01, API-01). */
export interface ScoredItem {
  itemId: string;
  correctOptionIds: readonly string[];
  /** Points entiers. */
  points: number;
}

export interface FinalAnswer {
  itemId: string;
  selectedOptionIds: readonly string[];
}

export type UnansweredRule = { kind: 'zero' } | { kind: 'penalty'; penaltyPoints: number };

export interface ItemResult {
  itemId: string;
  status: 'correct' | 'wrong' | 'unanswered';
  awarded: number;
}

export interface AttemptScore {
  score: number;
  max: number;
  perItem: ItemResult[];
  /** Réponses à des items absents du blueprint figé : ignorées, jamais créditées. */
  unknownItemIds: string[];
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

export function scoreAttempt(
  items: readonly ScoredItem[],
  answers: readonly FinalAnswer[],
  unanswered: UnansweredRule = { kind: 'zero' },
): AttemptScore {
  const byItem = new Map<string, FinalAnswer>();
  for (const a of answers) byItem.set(a.itemId, a); // la dernière réponse finale l'emporte
  const known = new Set(items.map((i) => i.itemId));
  const perItem: ItemResult[] = items.map((item) => {
    const ans = byItem.get(item.itemId);
    if (!ans || ans.selectedOptionIds.length === 0) {
      const awarded = unanswered.kind === 'penalty' ? -Math.abs(unanswered.penaltyPoints) : 0;
      return { itemId: item.itemId, status: 'unanswered', awarded };
    }
    const ok = sameSet(ans.selectedOptionIds, item.correctOptionIds);
    return { itemId: item.itemId, status: ok ? 'correct' : 'wrong', awarded: ok ? item.points : 0 };
  });
  return {
    score: perItem.reduce((s, r) => s + r.awarded, 0),
    max: items.reduce((s, i) => s + i.points, 0),
    perItem,
    unknownItemIds: [...byItem.keys()].filter((id) => !known.has(id)),
  };
}

/** CDC ASM-03 : rang de compétition (égalités = même rang) ; seuil de cohorte minimal. */
export const MIN_COHORT_FOR_RANKING = 30;

export function competitionRank(score: number, cohort: readonly number[]): number | null {
  if (cohort.length < MIN_COHORT_FOR_RANKING) return null;
  return 1 + cohort.filter((s) => s > score).length;
}

/** Part des scores strictement inférieurs + la moitié des égaux (en %). */
export function percentile(score: number, cohort: readonly number[]): number | null {
  if (cohort.length < MIN_COHORT_FOR_RANKING) return null;
  const below = cohort.filter((s) => s < score).length;
  const equal = cohort.filter((s) => s === score).length;
  return ((below + equal / 2) / cohort.length) * 100;
}
