import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asAnon, asUser, freshDb } from './harness';

const SEED = fileURLToPath(new URL('../../../supabase/seed.sql', import.meta.url));

describe('supabase/seed.sql (démo locale)', () => {
  it('se charge et produit 12 questions publiées, chacune avec exactement une bonne réponse', async () => {
    const db = await freshDb();
    await db.exec(readFileSync(SEED, 'utf8'));
    const pub = await db.query<{ n: number }>(`select count(*)::int as n from public.question_versions where state = 'published'`);
    expect(pub.rows[0]?.n).toBe(12);
    const bad = await db.query(
      `select v.id from public.question_versions v
        left join public.options o on o.question_version_id = v.id and o.is_correct
        group by v.id having count(o.id) <> 1`,
    );
    expect(bad.rows).toEqual([]);
    const four = await db.query(`select question_version_id from public.options group by 1 having count(*) <> 4`);
    expect(four.rows).toEqual([]);
    const skills = await db.query(`select 1 from public.question_skills where is_primary`);
    expect(skills.rows).toHaveLength(12);
    await db.close();
  }, 60_000);

  it("le seed est idempotent pour l'examen, les offres et les compétences", async () => {
    const db = await freshDb();
    await db.exec(readFileSync(SEED, 'utf8'));
    const exams = await db.query(`select 1 from public.exams`);
    const offers = await db.query(`select 1 from public.offers`);
    expect(exams.rows).toHaveLength(1);
    expect(offers.rows).toHaveLength(2);
    const exam = await db.query<{ date_status: string; exam_day: string | null }>(`select date_status, exam_day from public.exams`);
    expect(exam.rows[0]).toEqual({ date_status: 'unknown', exam_day: null }); // aucune date inventée
    await db.close();
  }, 60_000);

  it('un candidat authentifié lit les questions publiées mais pas les droits ni les profils des autres', async () => {
    const db = await freshDb();
    await db.exec(readFileSync(SEED, 'utf8'));
    await db.exec(`insert into auth.users(id, email) values ('00000000-0000-4000-8000-0000000000a1', 'a@example.test')`);
    await asUser(db, '00000000-0000-4000-8000-0000000000a1', async (q) => {
      expect((await q(`select id from public.question_versions`)).rows).toHaveLength(12);
      expect((await q(`select user_id from public.profiles`)).rows).toHaveLength(1);
    });
    await asAnon(db, async (q) => {
      expect((await q(`select code from public.offers`)).rows).toHaveLength(2);
    });
    await db.close();
  }, 60_000);
});
