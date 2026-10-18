import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asAnon, asService, asUser, freshDb, ID, seed, type Q } from './harness';

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  await seed(db);
}, 60_000);
afterAll(async () => {
  await db.close();
});

const ev = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('RLS : socle', () => {
  it('toutes les tables de public ont la RLS activée', async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("le test détecte une fuite : avec une politique permissive, Bob verrait le profil d'Alice", async () => {
    const leaky = await freshDb();
    await seed(leaky);
    await leaky.exec(`create policy leak on public.profiles for select to authenticated using (true)`);
    const rows = await asUser(leaky, ID.bob, async (q) =>
      (await q(`select user_id from public.profiles where user_id = '${ID.alice}'`)).rows);
    expect(rows).toHaveLength(1); // sans la politique « leak », ce serait 0 : le harnais applique bien la RLS
    await leaky.close();
  }, 60_000);
});

describe('isolation entre candidats (T07, T13)', () => {
  it('Alice ne lit que son profil ; elle ne peut ni lire ni modifier celui de Bob', async () => {
    await asUser(db, ID.alice, async (q) => {
      const own = await q(`select user_id from public.profiles`);
      expect(own.rows.map((r) => r.user_id)).toEqual([ID.alice]);
      const upd = await q(`update public.profiles set display_name = 'pirate' where user_id = '${ID.bob}'`);
      expect(upd.affectedRows ?? 0).toBe(0);
    });
    const { rows } = await db.query<{ display_name: string | null }>(`select display_name from public.profiles where user_id = '${ID.bob}'`);
    expect(rows[0]?.display_name).toBeNull();
  });

  it('Alice ne peut pas créer un profil au nom de Bob', async () => {
    await expect(
      asUser(db, ID.alice, (q) => q(`insert into public.profiles(user_id, display_name) values ('${ID.bob}', 'x')`)),
    ).rejects.toThrow();
  });

  it("Bob ne voit ni les tentatives ni les appareils d'Alice", async () => {
    await asUser(db, ID.bob, async (q) => {
      expect((await q(`select id from public.attempts`)).rows).toHaveLength(0);
      expect((await q(`select id from public.devices`)).rows).toHaveLength(0);
    });
    await asUser(db, ID.alice, async (q) => {
      expect((await q(`select id from public.attempts`)).rows).toHaveLength(1);
    });
  });

  it('un utilisateur anonyme ne lit aucune donnée personnelle', async () => {
    await expect(asAnon(db, (q) => q(`select * from public.profiles`))).rejects.toThrow();
    await expect(asAnon(db, (q) => q(`select * from public.attempts`))).rejects.toThrow();
  });

  it('les offres actives et le programme sont publics', async () => {
    await asAnon(db, async (q) => {
      expect((await q(`select code from public.offers`)).rows).toHaveLength(1);
      expect((await q(`select id from public.exams`)).rows).toHaveLength(1);
    });
  });
});

describe('contenu : visibilité et immuabilité (EDT-01, EDT-05)', () => {
  it('un candidat voit les versions publiées mais jamais un brouillon', async () => {
    await asUser(db, ID.bob, async (q) => {
      const v = await q(`select id from public.question_versions`);
      expect(v.rows.map((r) => r.id)).toEqual([ID.versionPublished]);
      expect((await q(`select id from public.options`)).rows).toHaveLength(2);
    });
  });
  it("l'auteur voit son brouillon", async () => {
    await asUser(db, ID.author, async (q) => {
      const v = await q(`select id from public.question_versions where state = 'draft'`);
      expect(v.rows).toHaveLength(1);
    });
  });
  it('un candidat ne peut pas écrire de question', async () => {
    await expect(
      asUser(db, ID.bob, (q) => q(`insert into public.questions(exam_id) values ('${ID.exam}')`)),
    ).rejects.toThrow();
  });
  it('une version publiée ne peut être ni modifiée ni supprimée ; ses options non plus', async () => {
    await expect(db.exec(`update public.question_versions set stem = 'altéré' where id = '${ID.versionPublished}'`)).rejects.toThrow(/immuable/);
    await expect(db.exec(`delete from public.question_versions where id = '${ID.versionPublished}'`)).rejects.toThrow(/supprim/);
    await expect(db.exec(`update public.options set is_correct = true where id = '${ID.optionWrong}'`)).rejects.toThrow(/immuables/);
    await expect(db.exec(`insert into public.options(question_version_id, position, body) values ('${ID.versionPublished}', 3, 'x')`)).rejects.toThrow(/immuables/);
  });
  it('suspendre une version publiée reste possible (EDT-04)', async () => {
    await db.exec(`update public.question_versions set state = 'suspended' where id = '${ID.versionPublished}'`);
    await db.exec(`update public.question_versions set state = 'published' where id = '${ID.versionPublished}'`);
  });
  it('publier exige trois personnes distinctes et un fondement de droits', async () => {
    await expect(db.exec(`update public.question_versions set state = 'published', reviewer_id = '${ID.author}', approver_id = '${ID.approver}', published_at = now(), rights_basis = 'original' where id = '${ID.versionDraft}'`)).rejects.toThrow();
    await expect(db.exec(`update public.question_versions set state = 'published', reviewer_id = '${ID.reviewer}', approver_id = '${ID.approver}', published_at = now() where id = '${ID.versionDraft}'`)).rejects.toThrow();
  });
});

describe('synchronisation idempotente (SYN-02, API-02)', () => {
  type Over = Partial<{ attempt: string; device: string; version: string; rev: number; sel: string[]; hash: string }>;
  const call = async (q: Q, id: string, over: Over = {}) => {
    const sel = over.sel ?? [ID.optionRight];
    const res = await q<{ r: string }>(
      `select public.ingest_response_event('${id}', '${over.attempt ?? ID.attemptAlice}', '${over.device ?? ID.deviceAlice}',
        '${over.version ?? ID.versionPublished}', ${over.rev ?? 1}, array[${sel.map((s) => `'${s}'`).join(',')}]::uuid[],
        '${over.hash ?? 'h1'}', now()) as r`,
    );
    return res.rows[0]?.r;
  };

  it('accepté, puis doublon identique, puis conflit si le contenu diffère', async () => {
    await asUser(db, ID.alice, async (q) => {
      expect(await call(q, ev(1))).toBe('accepted');
      expect(await call(q, ev(1))).toBe('duplicate');
      expect(await call(q, ev(1), { hash: 'autre' })).toBe('conflict');
    });
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.response_events where event_id = '${ev(1)}'`);
    expect(rows[0]?.n).toBe(1);
  });
  it('un autre événement pour la même (tentative, version, révision) est un conflit, jamais ignoré', async () => {
    await asUser(db, ID.alice, async (q) => {
      expect(await call(q, ev(2), { hash: 'h2' })).toBe('conflict');
      expect(await call(q, ev(3), { rev: 2, hash: 'h3' })).toBe('accepted'); // révision suivante : autorisée
    });
  });
  it("Bob ne peut pas écrire dans la tentative d'Alice", async () => {
    await asUser(db, ID.bob, async (q) => {
      expect(await call(q, ev(4))).toBe('invalid');
    });
  });
  it('une option étrangère à la question est refusée', async () => {
    await asUser(db, ID.alice, async (q) => {
      expect(await call(q, ev(5), { rev: 9, sel: ['99999999-9999-4999-8999-999999999999'] })).toBe('invalid');
    });
  });
  it('un appareil révoqué ne peut plus synchroniser', async () => {
    await db.exec(`update public.devices set revoked_at = now() where id = '${ID.deviceAlice}'`);
    await asUser(db, ID.alice, async (q) => {
      expect(await call(q, ev(6), { rev: 7 })).toBe('revoked');
    });
    await db.exec(`update public.devices set revoked_at = null where id = '${ID.deviceAlice}'`);
  });
  it("l'écriture directe dans response_events est interdite au client", async () => {
    await expect(
      asUser(db, ID.alice, (q) => q(`insert into public.response_events(event_id, attempt_id, user_id, question_version_id, payload_hash, client_time)
        values ('${ev(7)}', '${ID.attemptAlice}', '${ID.alice}', '${ID.versionPublished}', 'x', now())`)),
    ).rejects.toThrow();
  });
});

describe('commerce et paiement (PAY-01..04, COM-01)', () => {
  let orderId = '';
  it("le prix est figé côté serveur depuis l'offre ; la clé d'idempotence évite le doublon", async () => {
    await asUser(db, ID.alice, async (q) => {
      const a = await q<{ id: string }>(`select public.create_order('${ID.offer30}', null, 'web', null, 'k-1') as id`);
      const b = await q<{ id: string }>(`select public.create_order('${ID.offer30}', null, 'web', null, 'k-1') as id`);
      orderId = String(a.rows[0]?.id);
      expect(b.rows[0]?.id).toBe(orderId);
      const o = await q(`select amount_xaf, currency, status from public.orders where id = '${orderId}'`);
      expect(o.rows[0]).toEqual({ amount_xaf: 5000, currency: 'XAF', status: 'pending' });
    });
  });
  it('un client ne peut pas insérer ni modifier une commande ou un droit', async () => {
    await expect(asUser(db, ID.alice, (q) => q(`insert into public.orders(user_id, beneficiary_user_id, offer_id, amount_xaf, channel, terms_version, idempotency_key) values ('${ID.alice}', '${ID.alice}', '${ID.offer30}', 1, 'web', 'x', 'hack')`))).rejects.toThrow();
    await expect(asUser(db, ID.alice, (q) => q(`update public.orders set amount_xaf = 1, status = 'paid' where id = '${orderId}'`))).rejects.toThrow();
    await expect(asUser(db, ID.alice, (q) => q(`insert into public.entitlements(user_id, order_id, offer_id, starts_at, ends_at) values ('${ID.alice}', '${orderId}', '${ID.offer30}', now(), now() + interval '1 day')`))).rejects.toThrow();
  });
  it("Bob ne voit pas la commande d'Alice ; un bénéficiaire désigné la voit, sans accès aux résultats du payeur", async () => {
    await asUser(db, ID.bob, async (q) => {
      expect((await q(`select id from public.orders`)).rows).toHaveLength(0);
    });
    await asUser(db, ID.alice, async (q) => {
      await q(`select public.create_order('${ID.offer30}', '${ID.bob}', 'web', null, 'k-bob')`);
    });
    await asUser(db, ID.bob, async (q) => {
      expect((await q(`select id from public.orders`)).rows).toHaveLength(1);
      expect((await q(`select id from public.attempts`)).rows).toHaveLength(0); // payer ≠ accès aux résultats
    });
  });
  it('confirm_payment est interdit aux clients, réservé au service_role', async () => {
    await expect(asUser(db, ID.alice, (q) => q(`select public.confirm_payment('notchpay', 'ref-1', 5000)`))).rejects.toThrow();
    await expect(asAnon(db, (q) => q(`select public.confirm_payment('notchpay', 'ref-1', 5000)`))).rejects.toThrow();
  });
  it('succès confirmé : un seul droit, rejouable sans doublon', async () => {
    await db.exec(`insert into public.payment_attempts(order_id, provider, provider_ref, amount_xaf) values ('${orderId}', 'notchpay', 'ref-1', 5000)`);
    await asService(db, async (q) => {
      expect((await q<{ r: string }>(`select public.confirm_payment('notchpay', 'ref-1', 5000) as r`)).rows[0]?.r).toBe('granted');
      expect((await q<{ r: string }>(`select public.confirm_payment('notchpay', 'ref-1', 5000) as r`)).rows[0]?.r).toBe('already_granted');
    });
    const ent = await db.query<{ n: number; days: number }>(`select count(*)::int as n, round(extract(epoch from (max(ends_at) - max(starts_at))) / 86400)::int as days from public.entitlements where order_id = '${orderId}'`);
    expect(ent.rows[0]).toEqual({ n: 1, days: 30 });
    const out = await db.query<{ n: number }>(`select count(*)::int as n from public.outbox_events where topic = 'entitlement.granted'`);
    expect(out.rows[0]?.n).toBe(1);
    await asUser(db, ID.alice, async (q) => {
      expect((await q(`select id from public.entitlements`)).rows).toHaveLength(1);
    });
    await asUser(db, ID.bob, async (q) => {
      expect((await q(`select id from public.entitlements`)).rows).toHaveLength(0);
    });
  });
  it('montant différent : aucun droit ; référence inconnue : rien ; commande remboursée : jamais réactivée', async () => {
    const o2 = await asUser(db, ID.alice, async (q) => (await q<{ id: string }>(`select public.create_order('${ID.offer30}', null, 'web', null, 'k-2') as id`)).rows[0]?.id);
    await db.exec(`insert into public.payment_attempts(order_id, provider, provider_ref, amount_xaf) values ('${o2}', 'notchpay', 'ref-2', 5000)`);
    await asService(db, async (q) => {
      expect((await q<{ r: string }>(`select public.confirm_payment('notchpay', 'ref-2', 50) as r`)).rows[0]?.r).toBe('amount_mismatch');
      expect((await q<{ r: string }>(`select public.confirm_payment('notchpay', 'inconnue', 5000) as r`)).rows[0]?.r).toBe('unknown_attempt');
    });
    expect((await db.query(`select 1 from public.entitlements where order_id = '${o2}'`)).rows).toHaveLength(0);
    await db.exec(`update public.orders set status = 'refunded' where id = '${o2}'`);
    await asService(db, async (q) => {
      expect((await q<{ r: string }>(`select public.confirm_payment('notchpay', 'ref-2', 5000) as r`)).rows[0]?.r).toBe('refunded_order');
    });
    expect((await db.query(`select 1 from public.entitlements where order_id = '${o2}'`)).rows).toHaveLength(0);
  });
  it('les journaux de paiement ne sont lisibles que par la finance', async () => {
    const asAlice = await asUser(db, ID.alice, (q) => q(`select * from public.payment_attempts`));
    expect(asAlice.rows).toHaveLength(0);
    await expect(asUser(db, ID.alice, (q) => q(`select * from public.outbox_events`))).rejects.toThrow();
    await asUser(db, ID.finance, async (q) => {
      expect((await q(`select id from public.payment_attempts`)).rows.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('gouvernance et vie privée', () => {
  it('audit_events est en ajout seul, même pour un superutilisateur', async () => {
    await db.exec(`insert into public.audit_events(actor_id, action) values ('${ID.finance}', 'refund.approve')`);
    await expect(db.exec(`update public.audit_events set action = 'x'`)).rejects.toThrow(/ajout seul/);
    await expect(db.exec(`delete from public.audit_events`)).rejects.toThrow(/ajout seul/);
  });
  it('un signalement par compte et par version ; invisible aux autres candidats', async () => {
    await asUser(db, ID.alice, async (q) => {
      await q(`insert into public.content_flags(question_version_id, user_id, reason) values ('${ID.versionPublished}', '${ID.alice}', 'wrong')`);
    });
    await expect(asUser(db, ID.alice, (q) => q(`insert into public.content_flags(question_version_id, user_id, reason) values ('${ID.versionPublished}', '${ID.alice}', 'ambiguous')`))).rejects.toThrow();
    await asUser(db, ID.bob, async (q) => {
      expect((await q(`select id from public.content_flags`)).rows).toHaveLength(0);
    });
  });
  it("un candidat ne peut pas s'attribuer un rôle interne", async () => {
    await expect(asUser(db, ID.alice, (q) => q(`insert into public.staff_roles(user_id, role) values ('${ID.alice}', 'director')`))).rejects.toThrow();
  });
  it('les consentements sont historisés et personnels', async () => {
    await asUser(db, ID.alice, async (q) => {
      await q(`insert into public.consents(user_id, purpose, notice_version, granted) values ('${ID.alice}', 'analytics', 'v1', true)`);
      await q(`insert into public.consents(user_id, purpose, notice_version, granted) values ('${ID.alice}', 'analytics', 'v1', false)`);
      expect((await q(`select id from public.consents`)).rows).toHaveLength(2);
    });
    await asUser(db, ID.bob, async (q) => {
      expect((await q(`select id from public.consents`)).rows).toHaveLength(0);
    });
  });
});
