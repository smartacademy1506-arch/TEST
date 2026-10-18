-- OnLinePrep — schéma de base L1 (CDC v3.0 §8, §10, §12). PostgreSQL / Supabase.
-- Conventions : uuid, timestamptz UTC, montants en entiers XAF (5 000 = 5 000 francs),
-- RLS activée sur TOUTES les tables, FK avec règle ON DELETE explicite, index sur chaque FK.

-- ───────────────────────── utilitaires ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── identité ─────────────────────────
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  -- tranche d'âge plutôt que date de naissance complète (CDC PRV-01)
  age_band     text not null default 'unknown' check (age_band in ('under_15','15_17','18_plus','unknown')),
  locale       text not null default 'fr',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  label        text,
  platform     text not null check (platform in ('android','ios','web')),
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index devices_user_idx on public.devices(user_id);

create table public.staff_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('author','reviewer','pedagogy_lead','support','finance','ops','director')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index staff_roles_granted_by_idx on public.staff_roles(granted_by);

create or replace function public.has_role(p_role text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.staff_roles s where s.user_id = auth.uid() and s.role = p_role);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.staff_roles s where s.user_id = auth.uid());
$$;

-- Profil créé automatiquement à l'inscription
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── programme ─────────────────────────
create table public.exams (
  id            uuid primary key default gen_random_uuid(),
  country       text not null,
  track         text not null,
  academic_year text not null,
  -- EXM-01 : une date non confirmée ne déclenche ni compte à rebours ni expiration
  date_status   text not null default 'unknown' check (date_status in ('unknown','provisional','confirmed','postponed')),
  exam_day      date,
  official_source text,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (country, track, academic_year),
  constraint confirmed_needs_day_and_source check
    (date_status <> 'confirmed' or (exam_day is not null and official_source is not null))
);

create table public.skills (
  id      uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  code    text not null,
  label   text not null,
  domain  text not null,
  unique (exam_id, code)
);
create index skills_exam_idx on public.skills(exam_id);

-- ───────────────────────── contenu ─────────────────────────
create table public.questions (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.exams(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index questions_exam_idx on public.questions(exam_id);

create table public.question_versions (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null references public.questions(id) on delete restrict,
  version       integer not null check (version >= 1),
  stem          text not null,
  qtype         text not null default 'single' check (qtype in ('single','multiple','numeric')),
  explanation   text,
  language      text not null default 'fr',
  state         text not null default 'draft' check (state in
                  ('draft','in_review','disciplinary_review','pedagogic_validation','published','suspended','withdrawn')),
  high_stakes   boolean not null default false,
  rights_basis  text,   -- EDT-03 : original, licence, autorisation…
  author_id     uuid references auth.users(id) on delete set null,
  reviewer_id   uuid references auth.users(id) on delete set null,
  approver_id   uuid references auth.users(id) on delete set null,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (question_id, version),
  -- EDT-01 : trois personnes distinctes pour publier ; l'auteur ne valide jamais sa propre version
  constraint published_needs_distinct_people check (
    state not in ('published','suspended','withdrawn') or (
      author_id is not null and reviewer_id is not null and approver_id is not null
      and author_id <> reviewer_id and author_id <> approver_id and reviewer_id <> approver_id
      and published_at is not null and rights_basis is not null)
  )
);
create index question_versions_question_idx on public.question_versions(question_id);
create index question_versions_author_idx   on public.question_versions(author_id);
create index question_versions_reviewer_idx on public.question_versions(reviewer_id);
create index question_versions_approver_idx on public.question_versions(approver_id);
create index question_versions_state_idx   on public.question_versions(state);

create table public.options (
  id                  uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references public.question_versions(id) on delete cascade,
  position            integer not null check (position >= 1),
  body                text not null,
  is_correct          boolean not null default false,
  explanation         text,
  unique (question_version_id, position)
);
create index options_version_idx on public.options(question_version_id);

create table public.question_skills (
  question_version_id uuid not null references public.question_versions(id) on delete cascade,
  skill_id            uuid not null references public.skills(id) on delete restrict,
  is_primary          boolean not null default false,
  primary key (question_version_id, skill_id)
);
create index question_skills_skill_idx on public.question_skills(skill_id);

-- EDT-05 : une version publiée est immuable (seuls suspension/retrait sont possibles)
create or replace function public.question_versions_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.state in ('published','suspended','withdrawn') then
      raise exception 'Une version publiée ne peut pas être supprimée (EDT-05)';
    end if;
    return old;
  end if;
  if old.state in ('published','suspended','withdrawn') then
    if new.stem is distinct from old.stem or new.explanation is distinct from old.explanation
       or new.qtype is distinct from old.qtype or new.question_id is distinct from old.question_id
       or new.version is distinct from old.version or new.language is distinct from old.language then
      raise exception 'Une version publiée est immuable : créer une nouvelle version (EDT-05)';
    end if;
    if new.state not in ('published','suspended','withdrawn') then
      raise exception 'Une version publiée ne peut pas revenir au brouillon';
    end if;
  end if;
  return new;
end $$;
create trigger question_versions_guard_trg before update or delete on public.question_versions
  for each row execute function public.question_versions_guard();

create or replace function public.options_guard() returns trigger
language plpgsql as $$
declare v_state text; v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.question_version_id else new.question_version_id end;
  select state into v_state from public.question_versions where id = v_id;
  if v_state in ('published','suspended','withdrawn') then
    raise exception 'Les options d''une version publiée sont immuables (EDT-05)';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger options_guard_trg before insert or update or delete on public.options
  for each row execute function public.options_guard();

create or replace function public.can_read_version(p_version uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.question_versions v
    where v.id = p_version
      and (v.state = 'published' or v.author_id = auth.uid()
           or public.has_role('reviewer') or public.has_role('pedagogy_lead'))
  );
$$;

-- ───────────────────────── travail de l'apprenant ─────────────────────────
create table public.attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  device_id       uuid references public.devices(id) on delete set null,
  mode            text not null check (mode in ('diagnostic','daily','training','exam_sim')),
  blueprint_version text,
  seed            text,
  scoring_version text,
  state           text not null default 'open' check (state in ('open','submitted','void')),
  manifest        jsonb not null default '{}'::jsonb,   -- ASM-01 : manifeste figé
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz
);
create index attempts_user_idx   on public.attempts(user_id, started_at desc);
create index attempts_device_idx on public.attempts(device_id);

create table public.response_events (
  event_id            uuid primary key,                         -- clé d'idempotence fournie par le client
  attempt_id          uuid not null references public.attempts(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  device_id           uuid references public.devices(id) on delete set null,
  question_version_id uuid not null references public.question_versions(id) on delete restrict,
  answer_revision     integer not null default 1 check (answer_revision >= 1),
  selected_option_ids uuid[] not null default '{}',
  payload_hash        text not null,
  client_time         timestamptz not null,                     -- occurred_at côté client
  received_at         timestamptz not null default now(),       -- received_at côté serveur
  canonical_seq       bigint generated always as identity,      -- ordre canonique serveur (SYN-02)
  unique (attempt_id, question_version_id, answer_revision)
);
create index response_events_attempt_idx on public.response_events(attempt_id);
create index response_events_user_idx    on public.response_events(user_id);
create index response_events_version_idx on public.response_events(question_version_id);
create index response_events_device_idx  on public.response_events(device_id);

-- Projection reconstructible des boîtes de révision
create table public.review_items (
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  box         smallint not null default 0 check (box between 0 and 5),
  due_on      date,                                             -- jour pédagogique Africa/Douala
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index review_items_due_idx on public.review_items(user_id, due_on);
create index review_items_question_idx on public.review_items(question_id);

-- ───────────────────────── commerce ─────────────────────────
create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  label         text not null,
  kind          text not null check (kind in ('discovery','pass_30d','pass_session','coaching')),
  price_xaf     integer not null check (price_xaf >= 0),         -- entiers : 5000 = 5 000 francs
  currency      text not null default 'XAF',
  duration_days integer check (duration_days is null or duration_days > 0),
  ends_on       date,
  terms_version text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint pass_30d_is_30 check (kind <> 'pass_30d' or duration_days = 30),
  constraint pass_session_has_end check (kind <> 'pass_session' or ends_on is not null)
);

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete restrict,       -- payeur
  beneficiary_user_id uuid not null references auth.users(id) on delete restrict,       -- bénéficiaire
  offer_id            uuid not null references public.offers(id) on delete restrict,
  amount_xaf          integer not null check (amount_xaf >= 0),                          -- prix figé à la commande
  currency            text not null default 'XAF',
  channel             text not null check (channel in ('web','android','ios','reseller')),
  terms_version       text not null,
  status              text not null default 'pending' check (status in ('pending','paid','failed','cancelled','refunded')),
  idempotency_key     text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index orders_user_idx        on public.orders(user_id);
create index orders_beneficiary_idx on public.orders(beneficiary_user_id);
create index orders_offer_idx       on public.orders(offer_id);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.payment_attempts (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  provider     text not null,
  provider_ref text not null,
  status       text not null default 'initiated' check (status in ('initiated','pending','succeeded','failed','expired')),
  amount_xaf   integer not null check (amount_xaf >= 0),
  created_at   timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index payment_attempts_order_idx on public.payment_attempts(order_id);

create table public.payment_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_event_id  text not null,
  payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
  order_id           uuid references public.orders(id) on delete set null,
  event_type         text not null,
  signature_valid    boolean not null,
  payload            jsonb not null default '{}'::jsonb,   -- expurgé : jamais de PIN ni de donnée sensible
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  unique (provider, provider_event_id)                      -- déduplication des webhooks (PAY-02)
);
create index payment_events_attempt_idx on public.payment_events(payment_attempt_id);
create index payment_events_order_idx   on public.payment_events(order_id);

create table public.entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  order_id   uuid not null references public.orders(id) on delete restrict,
  offer_id   uuid not null references public.offers(id) on delete restrict,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id),                                         -- origine d'un droit unique (CDC §8.2)
  check (ends_at > starts_at)
);
create index entitlements_user_idx  on public.entitlements(user_id);
create index entitlements_offer_idx on public.entitlements(offer_id);

create table public.outbox_events (
  id           bigint generated always as identity primary key,
  topic        text not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index outbox_unprocessed_idx on public.outbox_events(created_at) where processed_at is null;

-- ───────────────────────── qualité, gouvernance, vie privée ─────────────────────────
create table public.content_flags (
  id                  uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references public.question_versions(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  reason              text not null check (reason in ('wrong','ambiguous','inaccessible','out_of_scope','other')),
  severity            text not null default 'normal' check (severity in ('normal','grave')),
  comment             text,
  created_at          timestamptz not null default now(),
  unique (user_id, question_version_id)                      -- EDT-04 : un signalement par compte et par version
);
create index content_flags_version_idx on public.content_flags(question_version_id);

create table public.audit_events (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);
create or replace function public.audit_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_events est en ajout seul (ADM-02)';
end $$;
create trigger audit_events_immutable_trg before update or delete on public.audit_events
  for each row execute function public.audit_events_immutable();

create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  purpose        text not null check (purpose in ('terms','privacy','analytics','marketing','reminders')),
  notice_version text not null,
  granted        boolean not null,
  recorded_at    timestamptz not null default now()
);
create index consents_user_idx on public.consents(user_id, purpose, recorded_at desc);

create table public.data_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  kind       text not null check (kind in ('access','correction','deletion','export')),
  status     text not null default 'received' check (status in ('received','verifying','in_progress','done','rejected')),
  due_on     date,
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index data_requests_user_idx on public.data_requests(user_id);

-- ───────────────────────── fonctions serveur ─────────────────────────
-- Ingestion idempotente d'une réponse (CDC SYN-02, API-02). Retour : accepted | duplicate | conflict | invalid | revoked
create or replace function public.ingest_response_event(
  p_event_id uuid, p_attempt_id uuid, p_device_id uuid, p_question_version_id uuid,
  p_answer_revision integer, p_selected uuid[], p_payload_hash text, p_client_time timestamptz
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.response_events%rowtype;
  v_selected uuid[] := coalesce(p_selected, '{}');
begin
  if v_uid is null then return 'invalid'; end if;

  select * into v_existing from public.response_events where event_id = p_event_id;
  if found then
    if v_existing.user_id = v_uid and v_existing.payload_hash = p_payload_hash then return 'duplicate'; end if;
    return 'conflict';                                   -- même clé, contenu différent : jamais ignoré en silence
  end if;

  if not exists (select 1 from public.attempts a where a.id = p_attempt_id and a.user_id = v_uid and a.state = 'open') then
    return 'invalid';
  end if;
  if not exists (select 1 from public.devices d where d.id = p_device_id and d.user_id = v_uid and d.revoked_at is null) then
    return 'revoked';
  end if;
  -- version retirée depuis : la réponse reste enregistrée (EDT-05) ; version inconnue : refus
  if not exists (select 1 from public.question_versions v where v.id = p_question_version_id) then
    return 'invalid';
  end if;
  if (select count(*) from public.options o
        where o.question_version_id = p_question_version_id and o.id = any (v_selected))
     <> cardinality(array(select distinct unnest(v_selected))) then
    return 'invalid';
  end if;

  begin
    insert into public.response_events(event_id, attempt_id, user_id, device_id, question_version_id,
                                       answer_revision, selected_option_ids, payload_hash, client_time)
    values (p_event_id, p_attempt_id, v_uid, p_device_id, p_question_version_id,
            greatest(p_answer_revision, 1), v_selected, p_payload_hash, p_client_time);
  exception when unique_violation then
    return 'conflict';
  end;
  return 'accepted';
end $$;

-- Création de commande : le prix vient TOUJOURS de l'offre, jamais du client (API-01, COM-01)
create or replace function public.create_order(
  p_offer_id uuid, p_beneficiary uuid, p_channel text, p_terms_version text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentification requise'; end if;
  select * into v_offer from public.offers where id = p_offer_id and active;
  if not found then raise exception 'offre indisponible'; end if;
  insert into public.orders(user_id, beneficiary_user_id, offer_id, amount_xaf, currency, channel, terms_version, idempotency_key)
  values (v_uid, coalesce(p_beneficiary, v_uid), v_offer.id, v_offer.price_xaf, v_offer.currency,
          p_channel, coalesce(p_terms_version, v_offer.terms_version), p_idempotency_key)
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.orders where user_id = v_uid and idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end $$;

-- Confirmation d'un paiement : appelée UNIQUEMENT par le serveur (service_role) après vérification de signature.
-- Transaction unique {statut + droit + événement outbox} (CDC §10.3). Retour :
-- granted | already_granted | amount_mismatch | unknown_attempt | refunded_order
create or replace function public.confirm_payment(
  p_provider text, p_provider_ref text, p_amount_xaf integer, p_currency text default 'XAF'
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pa public.payment_attempts%rowtype;
  o  public.orders%rowtype;
  f  public.offers%rowtype;
begin
  select * into pa from public.payment_attempts where provider = p_provider and provider_ref = p_provider_ref for update;
  if not found then return 'unknown_attempt'; end if;
  select * into o from public.orders where id = pa.order_id for update;
  if o.status = 'refunded' then return 'refunded_order'; end if;           -- un événement ancien ne réactive jamais un droit
  if p_amount_xaf <> o.amount_xaf or p_currency <> o.currency then return 'amount_mismatch'; end if;
  if exists (select 1 from public.entitlements e where e.order_id = o.id) then
    update public.payment_attempts set status = 'succeeded' where id = pa.id;
    return 'already_granted';
  end if;
  select * into f from public.offers where id = o.offer_id;
  update public.payment_attempts set status = 'succeeded' where id = pa.id;
  update public.orders set status = 'paid' where id = o.id;
  insert into public.entitlements(user_id, order_id, offer_id, starts_at, ends_at)
  values (o.beneficiary_user_id, o.id, o.offer_id, now(),
          case when f.kind = 'pass_session'
               then ((f.ends_on + 1)::timestamp at time zone 'Africa/Douala')
               else now() + make_interval(days => coalesce(f.duration_days, 30)) end);
  insert into public.outbox_events(topic, payload)
  values ('entitlement.granted', jsonb_build_object('order_id', o.id, 'user_id', o.beneficiary_user_id));
  return 'granted';
end $$;

-- ───────────────────────── sécurité par ligne (RLS) ─────────────────────────
alter table public.profiles          enable row level security;
alter table public.devices           enable row level security;
alter table public.staff_roles       enable row level security;
alter table public.exams             enable row level security;
alter table public.skills            enable row level security;
alter table public.questions         enable row level security;
alter table public.question_versions enable row level security;
alter table public.options           enable row level security;
alter table public.question_skills   enable row level security;
alter table public.attempts          enable row level security;
alter table public.response_events   enable row level security;
alter table public.review_items      enable row level security;
alter table public.offers            enable row level security;
alter table public.orders            enable row level security;
alter table public.payment_attempts  enable row level security;
alter table public.payment_events    enable row level security;
alter table public.entitlements      enable row level security;
alter table public.outbox_events     enable row level security;
alter table public.content_flags     enable row level security;
alter table public.audit_events      enable row level security;
alter table public.consents          enable row level security;
alter table public.data_requests     enable row level security;

-- profils : chacun les siens
create policy profiles_select_own on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_insert_own on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_support_read on public.profiles for select to authenticated using (public.has_role('support'));

-- appareils
create policy devices_select_own on public.devices for select to authenticated using (user_id = auth.uid());
create policy devices_insert_own on public.devices for insert to authenticated with check (user_id = auth.uid());
create policy devices_update_own on public.devices for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy devices_support_read on public.devices for select to authenticated using (public.has_role('support'));

-- rôles internes : lecture de ses propres rôles seulement ; écriture réservée au service_role
create policy staff_roles_select_own on public.staff_roles for select to authenticated using (user_id = auth.uid());

-- programme : lecture publique, écriture par la responsable pédagogique
create policy exams_read  on public.exams  for select to anon, authenticated using (true);
create policy skills_read on public.skills for select to anon, authenticated using (true);
create policy exams_write  on public.exams  for all to authenticated using (public.has_role('pedagogy_lead')) with check (public.has_role('pedagogy_lead'));
create policy skills_write on public.skills for all to authenticated using (public.has_role('pedagogy_lead')) with check (public.has_role('pedagogy_lead'));

-- contenu
create policy questions_read on public.questions for select to authenticated using (
  public.is_staff() or exists (select 1 from public.question_versions v where v.question_id = questions.id and v.state = 'published'));
create policy questions_insert_author on public.questions for insert to authenticated with check (public.has_role('author') or public.has_role('pedagogy_lead'));

create policy qv_read on public.question_versions for select to authenticated using (public.can_read_version(id));
create policy qv_insert_author on public.question_versions for insert to authenticated
  with check (public.has_role('author') and author_id = auth.uid() and state = 'draft');
create policy qv_update_workflow on public.question_versions for update to authenticated
  using ((author_id = auth.uid() and state in ('draft','in_review')) or public.has_role('reviewer') or public.has_role('pedagogy_lead'))
  with check ((author_id = auth.uid() and state in ('draft','in_review')) or public.has_role('reviewer') or public.has_role('pedagogy_lead'));

create policy options_read  on public.options for select to authenticated using (public.can_read_version(question_version_id));
create policy options_write on public.options for all to authenticated
  using (exists (select 1 from public.question_versions v where v.id = options.question_version_id and v.author_id = auth.uid() and v.state in ('draft','in_review')))
  with check (exists (select 1 from public.question_versions v where v.id = options.question_version_id and v.author_id = auth.uid() and v.state in ('draft','in_review')));

create policy qskills_read on public.question_skills for select to authenticated using (public.can_read_version(question_version_id));
create policy qskills_write on public.question_skills for all to authenticated
  using (exists (select 1 from public.question_versions v where v.id = question_skills.question_version_id and v.author_id = auth.uid() and v.state in ('draft','in_review')))
  with check (exists (select 1 from public.question_versions v where v.id = question_skills.question_version_id and v.author_id = auth.uid() and v.state in ('draft','in_review')));

-- travail : strictement personnel ; les réponses entrent uniquement par ingest_response_event()
create policy attempts_select_own on public.attempts for select to authenticated using (user_id = auth.uid());
create policy attempts_insert_own on public.attempts for insert to authenticated with check (user_id = auth.uid());
create policy attempts_update_own on public.attempts for update to authenticated using (user_id = auth.uid() and state = 'open') with check (user_id = auth.uid());
create policy response_events_select_own on public.response_events for select to authenticated using (user_id = auth.uid());
create policy review_items_own on public.review_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- commerce : le client lit, ne crée ni ne modifie ; tout passe par les fonctions serveur
create policy offers_read on public.offers for select to anon, authenticated using (active);
create policy offers_write on public.offers for all to authenticated using (public.has_role('director')) with check (public.has_role('director'));
create policy orders_select_party on public.orders for select to authenticated using (user_id = auth.uid() or beneficiary_user_id = auth.uid());
create policy orders_finance_read on public.orders for select to authenticated using (public.has_role('finance'));
create policy payment_attempts_finance on public.payment_attempts for select to authenticated using (public.has_role('finance'));
create policy payment_events_finance on public.payment_events for select to authenticated using (public.has_role('finance'));
create policy entitlements_select_own on public.entitlements for select to authenticated using (user_id = auth.uid());
-- outbox_events : aucune politique → inaccessible aux clients (service_role seulement)

-- qualité et vie privée
create policy flags_insert_own on public.content_flags for insert to authenticated with check (user_id = auth.uid());
create policy flags_select_own on public.content_flags for select to authenticated using (user_id = auth.uid() or public.has_role('pedagogy_lead'));
create policy audit_read_ops on public.audit_events for select to authenticated using (public.has_role('director') or public.has_role('ops'));
create policy consents_insert_own on public.consents for insert to authenticated with check (user_id = auth.uid());
create policy consents_select_own on public.consents for select to authenticated using (user_id = auth.uid());
create policy data_requests_insert_own on public.data_requests for insert to authenticated with check (user_id = auth.uid());
create policy data_requests_select_own on public.data_requests for select to authenticated using (user_id = auth.uid());

-- ───────────────────────── privilèges (défense en profondeur) ─────────────────────────
revoke all on public.outbox_events, public.payment_events, public.payment_attempts, public.audit_events from anon, authenticated;
grant select on public.payment_events, public.payment_attempts, public.audit_events to authenticated; -- filtrées par RLS (finance/ops)
revoke insert, update, delete on public.orders, public.entitlements, public.response_events, public.staff_roles from anon, authenticated;
revoke all on public.profiles, public.devices, public.attempts, public.response_events, public.review_items,
              public.orders, public.entitlements, public.content_flags, public.consents, public.data_requests,
              public.staff_roles, public.question_versions, public.options, public.question_skills, public.questions from anon;

revoke all on function public.confirm_payment(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.confirm_payment(text, text, integer, text) to service_role;
revoke all on function public.ingest_response_event(uuid, uuid, uuid, uuid, integer, uuid[], text, timestamptz) from public, anon;
grant execute on function public.ingest_response_event(uuid, uuid, uuid, uuid, integer, uuid[], text, timestamptz) to authenticated;
revoke all on function public.create_order(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_order(uuid, uuid, text, text, text) to authenticated;
