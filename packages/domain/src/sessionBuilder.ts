import { seededShuffle } from './rng';

/** CDC PED-03 : 50 % d'items dus, 30 % de compétences prioritaires, 20 % de consolidation mélangée. */
export const SESSION_QUOTA_PERCENT = { due: 50, priority: 30, consolidation: 20 } as const;
export const DEFAULT_SESSION_SIZE = 20;
export const SHORT_SESSION_SIZE = 10;

export interface SessionCandidates {
  /** Items dus (déjà triés par priorité de retard décroissante par l'appelant). */
  due: readonly string[];
  priority: readonly string[];
  consolidation: readonly string[];
  /** Nouveau contenu autorisé, utilisé pour compléter. */
  fresh: readonly string[];
}

export interface SessionRequest {
  size: number;
  /** Graine stable (ex. `${userId}:${pedagogicDay}`). */
  seed: string;
  candidates: SessionCandidates;
  /** Quotas d'accès (offre gratuite, droits) : un item refusé n'est jamais sélectionné. */
  isAllowed?: (questionId: string) => boolean;
}

export interface SessionPlan {
  questionIds: string[];
  requested: number;
  /** > 0 : la banque est insuffisante, la séance est plus courte et doit être annoncée. */
  shortfall: number;
  byCategory: { due: number; priority: number; consolidation: number; fresh: number };
}

/** Répartition en entiers par plus grands restes ; égalité de reste départagée par l'ordre des parts. */
export function largestRemainder(total: number, percents: readonly number[]): number[] {
  const raw = percents.map((p) => total * p); // entiers : pas d'erreur flottante
  const base = raw.map((r) => Math.floor(r / 100));
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rem: r % 100 }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    base[i] = (base[i] as number) + 1;
    left--;
  }
  return base;
}

export function buildSession(req: SessionRequest): SessionPlan {
  const size = Math.max(0, Math.floor(req.size));
  const allowed = req.isAllowed ?? (() => true);
  const seen = new Set<string>();
  const clean = (ids: readonly string[]): string[] => {
    const out: string[] = [];
    for (const id of ids) {
      if (seen.has(id) || !allowed(id)) continue;
      seen.add(id); // pas de doublon dans une séance, précédence due > priorité > consolidation > nouveau
      out.push(id);
    }
    return out;
  };
  const pools = {
    due: clean(req.candidates.due),
    priority: clean(req.candidates.priority),
    consolidation: clean(req.candidates.consolidation),
    fresh: clean(req.candidates.fresh),
  };

  const [qDue, qPrio, qCons] = largestRemainder(size, [
    SESSION_QUOTA_PERCENT.due,
    SESSION_QUOTA_PERCENT.priority,
    SESSION_QUOTA_PERCENT.consolidation,
  ]) as [number, number, number];

  const picked: string[] = [];
  const byCategory = { due: 0, priority: 0, consolidation: 0, fresh: 0 };
  const take = (cat: keyof typeof pools, n: number) => {
    const chosen = pools[cat].splice(0, n);
    picked.push(...chosen);
    byCategory[cat] += chosen.length;
  };

  take('due', qDue);
  take('priority', qPrio);
  take('consolidation', qCons);
  // Catégorie déficitaire : compléter avec les autres catégories, puis avec du nouveau contenu.
  for (const cat of ['due', 'priority', 'consolidation', 'fresh'] as const) {
    if (picked.length >= size) break;
    take(cat, size - picked.length);
  }

  return {
    questionIds: seededShuffle(picked, req.seed),
    requested: size,
    shortfall: size - picked.length,
    byCategory,
  };
}
