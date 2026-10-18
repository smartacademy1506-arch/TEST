import { describe, expect, it } from 'vitest';
import { addDays, diffDays, pedagogicDay } from './days';
import { applyAnswer, inConsolidation, isDue, newReviewState, nextBox, type ReviewState } from './scheduler';

const TODAY = '2026-11-20';

describe('jour pédagogique (Africa/Douala)', () => {
  it('23:30 UTC est déjà le lendemain à Douala', () => {
    expect(pedagogicDay(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-21');
    expect(pedagogicDay(new Date('2026-11-20T22:59:00Z'))).toBe('2026-11-20');
  });
  it('addDays et diffDays traversent mois et années', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2026-11-20', '2026-12-01')).toBe(11);
  });
  it('refuse une date invalide', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('boîtes de révision 1-2-4-7-14 (PED-02)', () => {
  it('première réponse fausse → boîte 1, due le lendemain', () => {
    const s = applyAnswer(newReviewState('q1'), false, TODAY);
    expect(s).toEqual({ questionId: 'q1', box: 1, dueOn: '2026-11-21' });
  });
  it('première réponse juste → boîte 2, due à J+2', () => {
    const s = applyAnswer(newReviewState('q1'), true, TODAY);
    expect(s).toMatchObject({ box: 2, dueOn: '2026-11-22' });
  });
  it('réussites successives : 2 → 3 → 4 → 5 avec 4, 7, 14 jours', () => {
    let s: ReviewState = { questionId: 'q', box: 2, dueOn: TODAY };
    s = applyAnswer(s, true, TODAY);
    expect(s).toMatchObject({ box: 3, dueOn: '2026-11-24' });
    s = applyAnswer(s, true, TODAY);
    expect(s).toMatchObject({ box: 4, dueOn: '2026-11-27' });
    s = applyAnswer(s, true, TODAY);
    expect(s).toMatchObject({ box: 5, dueOn: '2026-12-04' });
  });
  it('plafond de boîte 5 : une réussite renouvelle 14 jours', () => {
    const s = applyAnswer({ questionId: 'q', box: 5, dueOn: TODAY }, true, TODAY);
    expect(s).toMatchObject({ box: 5, dueOn: '2026-12-04' });
  });
  it('une erreur ramène toujours en boîte 1', () => {
    for (const box of [1, 2, 3, 4, 5] as const) expect(nextBox(box, false)).toBe(1);
  });
  it('une révision en retard reste due (jamais échouée automatiquement)', () => {
    const s: ReviewState = { questionId: 'q', box: 3, dueOn: '2026-10-01' };
    expect(isDue(s, TODAY)).toBe(true);
    expect(s.box).toBe(3);
  });
  it("un item jamais vu ou à échéance future n'est pas dû", () => {
    expect(isDue(newReviewState('q'), TODAY)).toBe(false);
    expect(isDue({ questionId: 'q', box: 2, dueOn: '2026-11-21' }, TODAY)).toBe(false);
  });
});

describe("proximité de l'examen", () => {
  const state: ReviewState = { questionId: 'q', box: 4, dueOn: TODAY };
  it('date CONFIRMÉE : échéance plafonnée à J-2 tant que ce jour est futur', () => {
    const s = applyAnswer(state, true, TODAY, { day: '2026-12-01', confirmed: true });
    expect(s.dueOn).toBe('2026-11-29');
  });
  it('date non confirmée : aucun plafond ni compte à rebours', () => {
    const s = applyAnswer(state, true, TODAY, { day: '2026-12-01', confirmed: false });
    expect(s.dueOn).toBe('2026-12-04');
    expect(inConsolidation(TODAY, { day: '2026-11-21', confirmed: false })).toBe(false);
  });
  it('à partir de J-2 : consolidation, plus de plafond qui boucle sur des rappels immédiats', () => {
    const exam = { day: '2026-11-21', confirmed: true };
    expect(inConsolidation(TODAY, exam)).toBe(true);
    const s = applyAnswer(state, true, TODAY, exam);
    expect(s.dueOn).toBe('2026-12-04');
  });
  it("sans date d'examen : comportement normal", () => {
    expect(applyAnswer(state, true, TODAY).dueOn).toBe('2026-12-04');
  });
});
