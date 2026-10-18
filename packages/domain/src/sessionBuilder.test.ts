import { describe, expect, it } from 'vitest';
import { buildSession, largestRemainder, type SessionCandidates } from './sessionBuilder';

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const plenty: SessionCandidates = {
  due: ids('d', 40),
  priority: ids('p', 40),
  consolidation: ids('c', 40),
  fresh: ids('f', 40),
};

describe('quotas par plus grands restes (PED-03)', () => {
  it('20 → 10/6/4 ; 10 → 5/3/2', () => {
    expect(largestRemainder(20, [50, 30, 20])).toEqual([10, 6, 4]);
    expect(largestRemainder(10, [50, 30, 20])).toEqual([5, 3, 2]);
  });
  it('15 → 8/4/3 (égalité de reste départagée par l\'ordre stable) et la somme est exacte', () => {
    expect(largestRemainder(15, [50, 30, 20])).toEqual([8, 4, 3]);
    for (let n = 0; n <= 40; n++) {
      expect(largestRemainder(n, [50, 30, 20]).reduce((a, b) => a + b, 0)).toBe(n);
    }
  });
});

describe('composition de séance', () => {
  it('20 questions : 50 % dues, 30 % prioritaires, 20 % consolidation', () => {
    const plan = buildSession({ size: 20, seed: 'u1:2026-11-20', candidates: plenty });
    expect(plan.questionIds).toHaveLength(20);
    expect(plan.shortfall).toBe(0);
    expect(plan.byCategory).toEqual({ due: 10, priority: 6, consolidation: 4, fresh: 0 });
  });
  it('séance courte de 10 sur demande', () => {
    const plan = buildSession({ size: 10, seed: 's', candidates: plenty });
    expect(plan.byCategory).toEqual({ due: 5, priority: 3, consolidation: 2, fresh: 0 });
  });
  it('aucun doublon, même si une question figure dans plusieurs catégories', () => {
    const plan = buildSession({
      size: 20,
      seed: 's',
      candidates: { due: ['x', ...ids('d', 20)], priority: ['x', ...ids('p', 20)], consolidation: ['x', ...ids('c', 20)], fresh: [] },
    });
    expect(new Set(plan.questionIds).size).toBe(plan.questionIds.length);
  });
  it('catégorie déficitaire : complétée par les autres puis par du nouveau contenu', () => {
    const plan = buildSession({
      size: 20,
      seed: 's',
      candidates: { due: ids('d', 2), priority: ids('p', 30), consolidation: ids('c', 30), fresh: ids('f', 30) },
    });
    expect(plan.questionIds).toHaveLength(20);
    expect(plan.byCategory.due).toBe(2);
    expect(plan.byCategory.priority + plan.byCategory.consolidation + plan.byCategory.fresh).toBe(18);
  });
  it('banque de 6 questions : séance plus courte annoncée, jamais de doublon', () => {
    const plan = buildSession({
      size: 20,
      seed: 's',
      candidates: { due: ['a', 'b'], priority: ['c', 'd'], consolidation: ['e'], fresh: ['f'] },
    });
    expect(plan.questionIds).toHaveLength(6);
    expect(plan.shortfall).toBe(14);
    expect(new Set(plan.questionIds).size).toBe(6);
  });
  it('boîte vide et rien de dû : tout vient du nouveau contenu', () => {
    const plan = buildSession({ size: 20, seed: 's', candidates: { due: [], priority: [], consolidation: [], fresh: ids('f', 25) } });
    expect(plan.byCategory).toEqual({ due: 0, priority: 0, consolidation: 0, fresh: 20 });
  });
  it('quota d\'accès : un item non autorisé n\'est jamais choisi', () => {
    const plan = buildSession({ size: 20, seed: 's', candidates: plenty, isAllowed: (id) => !id.startsWith('f') && id !== 'd1' });
    expect(plan.questionIds).not.toContain('d1');
    expect(plan.questionIds.every((id) => !id.startsWith('f'))).toBe(true);
  });
  it('même graine et mêmes règles → même séance (T05) ; autre graine → autre ordre', () => {
    const a = buildSession({ size: 20, seed: 'u1:J', candidates: plenty });
    const b = buildSession({ size: 20, seed: 'u1:J', candidates: plenty });
    const c = buildSession({ size: 20, seed: 'u1:K', candidates: plenty });
    expect(a.questionIds).toEqual(b.questionIds);
    expect(c.questionIds).not.toEqual(a.questionIds);
    expect([...c.questionIds].sort()).toEqual([...a.questionIds].sort());
  });
  it('taille nulle ou négative : séance vide sans erreur', () => {
    expect(buildSession({ size: 0, seed: 's', candidates: plenty }).questionIds).toEqual([]);
    expect(buildSession({ size: -3, seed: 's', candidates: plenty }).requested).toBe(0);
  });
});
