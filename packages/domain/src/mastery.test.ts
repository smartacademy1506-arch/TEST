import { describe, expect, it } from 'vitest';
import { diagnosticProfile, pickDiagnostic, DIAGNOSTIC_SIZE } from './diagnostic';
import { emptyMastery, masteryLabel, observe } from './mastery';
import { competitionRank, percentile, scoreAttempt } from './scoring';

describe('indicateur de travail (PED-04)', () => {
  it('aucune observation : « non évalué »', () => {
    expect(masteryLabel(emptyMastery()).kind).toBe('not_evaluated');
  });
  it('la première observation initialise ; ensuite m = 0,7·m + 0,3·résultat', () => {
    let m = observe(emptyMastery(), 'q1', true);
    expect(m.value).toBe(1);
    m = observe(m, 'q2', false);
    expect(m.value).toBeCloseTo(0.7);
  });
  it('0,8 après cinq essais sur peu de questions distinctes n\'affiche jamais de réussite acquise', () => {
    let m = emptyMastery();
    for (const _ of [1, 2, 3, 4, 5]) m = observe(m, 'meme-question', true);
    expect(m.value).toBeGreaterThan(0.8);
    expect(masteryLabel(m)).toEqual({ kind: 'to_confirm', distinctQuestions: 1 });
  });
  it('les répétitions ne gonflent pas le décompte des questions distinctes', () => {
    let m = emptyMastery();
    m = observe(m, 'a', true);
    m = observe(m, 'a', true);
    expect(m.distinctQuestionIds).toEqual(['a']);
  });
  it('une remédiation immédiate n\'est pas une preuve indépendante', () => {
    const m = observe(observe(emptyMastery(), 'a', false), 'a', true, false);
    expect(m.value).toBe(0);
    expect(m.distinctQuestionIds).toEqual(['a']);
  });
  it('libellés avec suffisamment de questions distinctes', () => {
    const run = (pattern: boolean[]) =>
      masteryLabel(pattern.reduce((m, ok, i) => observe(m, `q${i}`, ok), emptyMastery())).kind;
    expect(run([false, false, false, false, false, false])).toBe('to_work');
    expect(run([true, true, true, true, true, true])).toBe('encouraging');
    // m : 0 → 0,3 → 0,21 → 0,447 → 0,313 → 0,519 : entre 0,5 et 0,75
    expect(run([false, true, false, true, false, true])).toBe('in_progress');
  });
});

describe('diagnostic (PED-01, T04)', () => {
  const bank = {
    biologie: Array.from({ length: 12 }, (_, i) => `b${i}`),
    chimie: Array.from({ length: 12 }, (_, i) => `c${i}`),
    physique: Array.from({ length: 12 }, (_, i) => `p${i}`),
  };
  it('15 questions réparties équitablement, sans doublon, déterministes', () => {
    const a = pickDiagnostic(bank, 'inst-1');
    expect(a).toHaveLength(DIAGNOSTIC_SIZE);
    expect(new Set(a).size).toBe(15);
    expect(a.filter((id) => id.startsWith('b'))).toHaveLength(5);
    expect(pickDiagnostic(bank, 'inst-1')).toEqual(a);
  });
  it('banque trop petite : renvoie ce qui existe sans boucle infinie', () => {
    expect(pickDiagnostic({ x: ['a', 'b'] }, 's')).toHaveLength(2);
  });
  it('une seule réponse par domaine : « à confirmer », pas de précision trompeuse', () => {
    const profile = diagnosticProfile([
      { domain: 'biologie', correct: true },
      { domain: 'chimie', correct: false },
    ]);
    expect(profile.every((p) => p.kind === 'to_confirm' && p.uncertain)).toBe(true);
  });
  it('assez de réponses : repérage par domaine', () => {
    const answers = [
      ...Array.from({ length: 5 }, () => ({ domain: 'biologie', correct: true })),
      ...Array.from({ length: 5 }, () => ({ domain: 'chimie', correct: false })),
    ];
    const byDomain = Object.fromEntries(diagnosticProfile(answers).map((p) => [p.domain, p.kind]));
    expect(byDomain).toEqual({ biologie: 'encouraging', chimie: 'to_work' });
  });
});

describe('score serveur et classement', () => {
  const items = [
    { itemId: 'i1', correctOptionIds: ['a'], points: 2 },
    { itemId: 'i2', correctOptionIds: ['b', 'c'], points: 3 },
    { itemId: 'i3', correctOptionIds: ['d'], points: 1 },
  ];
  it('score depuis les réponses finales ; réponse multiple exacte ; sans réponse = 0', () => {
    const r = scoreAttempt(items, [
      { itemId: 'i1', selectedOptionIds: ['a'] },
      { itemId: 'i2', selectedOptionIds: ['c', 'b'] },
    ]);
    expect(r.score).toBe(5);
    expect(r.max).toBe(6);
    expect(r.perItem.map((p) => p.status)).toEqual(['correct', 'correct', 'unanswered']);
  });
  it('réponse partielle ou fausse : aucun point ; la dernière réponse l\'emporte', () => {
    const r = scoreAttempt(items, [
      { itemId: 'i2', selectedOptionIds: ['b'] },
      { itemId: 'i1', selectedOptionIds: ['z'] },
      { itemId: 'i1', selectedOptionIds: ['a'] },
    ]);
    expect(r.perItem.find((p) => p.itemId === 'i2')?.status).toBe('wrong');
    expect(r.perItem.find((p) => p.itemId === 'i1')?.status).toBe('correct');
  });
  it('règle de pénalité explicite pour les questions sans réponse', () => {
    expect(scoreAttempt(items, [], { kind: 'penalty', penaltyPoints: 1 }).score).toBe(-3);
  });
  it('un client ne peut pas se créditer un item absent du blueprint', () => {
    const r = scoreAttempt(items, [{ itemId: 'zzz', selectedOptionIds: ['a'] }]);
    expect(r.score).toBe(0);
    expect(r.unknownItemIds).toEqual(['zzz']);
  });
  it('classement : null sous 30 participants ; égalités = même rang ; percentile', () => {
    expect(competitionRank(10, [10, 9, 8])).toBeNull();
    const cohort = [...Array.from({ length: 28 }, (_, i) => i), 20, 20];
    expect(competitionRank(20, cohort)).toBe(1 + cohort.filter((s) => s > 20).length);
    // 20 scores strictement inférieurs + moitié des 3 égaux (20 apparaît 3 fois) sur 30 participants
    expect(percentile(20, cohort)).toBeCloseTo(((20 + 3 / 2) / 30) * 100);
  });
});
