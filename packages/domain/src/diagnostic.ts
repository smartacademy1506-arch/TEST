import { seededShuffle } from './rng';
import type { MasteryKind } from './mastery';

/** CDC PED-01 : 15 questions, repérage par domaine, jamais un pourcentage précis. */
export const DIAGNOSTIC_SIZE = 15;
/** Sous ce nombre de réponses dans un domaine, le résultat reste « à confirmer » (T04). */
export const DIAGNOSTIC_MIN_PER_DOMAIN = 3;

/** Un tour de table sur les domaines (ordre alphabétique stable), questions mélangées par graine. */
export function pickDiagnostic(
  byDomain: Readonly<Record<string, readonly string[]>>,
  seed: string,
  size = DIAGNOSTIC_SIZE,
): string[] {
  const domains = Object.keys(byDomain).sort();
  const queues = domains.map((d) => seededShuffle(byDomain[d] ?? [], `${seed}:${d}`));
  const out: string[] = [];
  let progressed = true;
  while (out.length < size && progressed) {
    progressed = false;
    for (const q of queues) {
      const next = q.shift();
      if (next !== undefined) {
        out.push(next);
        progressed = true;
        if (out.length === size) break;
      }
    }
  }
  return out;
}

export interface DiagnosticAnswer {
  domain: string;
  correct: boolean;
}

export interface DomainProfile {
  domain: string;
  answered: number;
  kind: MasteryKind;
  /** Vrai quand peu d'items : l'interface affiche « à confirmer » au lieu d'une précision trompeuse. */
  uncertain: boolean;
}

export function diagnosticProfile(answers: readonly DiagnosticAnswer[]): DomainProfile[] {
  const acc = new Map<string, { n: number; ok: number }>();
  for (const a of answers) {
    const cur = acc.get(a.domain) ?? { n: 0, ok: 0 };
    cur.n += 1;
    cur.ok += a.correct ? 1 : 0;
    acc.set(a.domain, cur);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, { n, ok }]) => {
      if (n < DIAGNOSTIC_MIN_PER_DOMAIN) {
        return { domain, answered: n, kind: 'to_confirm' as const, uncertain: true };
      }
      const ratio = ok / n;
      const kind: MasteryKind = ratio < 0.5 ? 'to_work' : ratio < 0.75 ? 'in_progress' : 'encouraging';
      return { domain, answered: n, kind, uncertain: false };
    });
}
