import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));

export const ID = {
  alice: '00000000-0000-4000-8000-0000000000a1',
  bob: '00000000-0000-4000-8000-0000000000b2',
  author: '00000000-0000-4000-8000-0000000000c3',
  reviewer: '00000000-0000-4000-8000-0000000000d4',
  approver: '00000000-0000-4000-8000-0000000000e5',
  finance: '00000000-0000-4000-8000-0000000000f6',
  exam: '10000000-0000-4000-8000-000000000001',
  skill: '10000000-0000-4000-8000-000000000002',
  question: '10000000-0000-4000-8000-000000000003',
  versionPublished: '10000000-0000-4000-8000-000000000004',
  optionRight: '10000000-0000-4000-8000-000000000005',
  optionWrong: '10000000-0000-4000-8000-000000000006',
  offer30: '10000000-0000-4000-8000-000000000007',
  versionDraft: '10000000-0000-4000-8000-000000000008',
  questionDraft: '10000000-0000-4000-8000-000000000009',
  deviceAlice: '20000000-0000-4000-8000-0000000000a1',
  attemptAlice: '20000000-0000-4000-8000-0000000000a2',
} as const;

/** Imite ce que Supabase fournit : rôles, schéma auth, auth.uid(), privilèges par défaut. */
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  return db;
}

/** Données de test fictives, insérées en superutilisateur (hors RLS). */
export async function seed(db: PGlite): Promise<void> {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${ID.alice}', 'alice@example.test'), ('${ID.bob}', 'bob@example.test'),
      ('${ID.author}', 'author@example.test'), ('${ID.reviewer}', 'reviewer@example.test'),
      ('${ID.approver}', 'approver@example.test'), ('${ID.finance}', 'finance@example.test');
    insert into public.staff_roles(user_id, role) values
      ('${ID.author}', 'author'), ('${ID.reviewer}', 'reviewer'),
      ('${ID.approver}', 'pedagogy_lead'), ('${ID.finance}', 'finance');
    insert into public.exams(id, country, track, academic_year) values ('${ID.exam}', 'CM', 'medicine', '2026-2027');
    insert into public.skills(id, exam_id, code, label, domain) values ('${ID.skill}', '${ID.exam}', 'BIO-CELL', 'Biologie cellulaire', 'biologie');
    insert into public.questions(id, exam_id) values ('${ID.question}', '${ID.exam}'), ('${ID.questionDraft}', '${ID.exam}');
    -- on rédige en brouillon, on ajoute les options, PUIS on publie (une version publiée est immuable)
    insert into public.question_versions(id, question_id, version, stem, state, author_id)
      values ('${ID.versionPublished}', '${ID.question}', 1, 'Question publiée (démo)', 'draft', '${ID.author}');
    insert into public.options(id, question_version_id, position, body, is_correct) values
      ('${ID.optionRight}', '${ID.versionPublished}', 1, 'Bonne réponse', true),
      ('${ID.optionWrong}', '${ID.versionPublished}', 2, 'Mauvaise réponse', false);
    update public.question_versions set state = 'published', reviewer_id = '${ID.reviewer}', approver_id = '${ID.approver}',
      published_at = now(), rights_basis = 'original' where id = '${ID.versionPublished}';
    insert into public.question_versions(id, question_id, version, stem, state, author_id)
      values ('${ID.versionDraft}', '${ID.questionDraft}', 1, 'Brouillon (démo)', 'draft', '${ID.author}');
    insert into public.offers(id, code, label, kind, price_xaf, duration_days, terms_version)
      values ('${ID.offer30}', 'pass30', 'Pass 30 jours (test)', 'pass_30d', 5000, 30, 'cgv-test-1');
    insert into public.devices(id, user_id, platform) values ('${ID.deviceAlice}', '${ID.alice}', 'android');
    insert into public.attempts(id, user_id, device_id, mode) values ('${ID.attemptAlice}', '${ID.alice}', '${ID.deviceAlice}', 'daily');
  `);
}

type Row = Record<string, unknown>;
export type Q = <T extends Row = Row>(sql: string) => Promise<{ rows: T[]; affectedRows?: number }>;

/** Exécute `fn` comme un client authentifié (JWT sub = uid), puis revient au superutilisateur. */
export async function asUser<T>(db: PGlite, uid: string, fn: (q: Q) => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn((sql) => db.query(sql) as never);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function asAnon<T>(db: PGlite, fn: (q: Q) => Promise<T>): Promise<T> {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await fn((sql) => db.query(sql) as never);
  } finally {
    await db.exec(`reset role;`);
  }
}

export async function asService<T>(db: PGlite, fn: (q: Q) => Promise<T>): Promise<T> {
  await db.exec(`set role service_role;`);
  try {
    return await fn((sql) => db.query(sql) as never);
  } finally {
    await db.exec(`reset role;`);
  }
}
