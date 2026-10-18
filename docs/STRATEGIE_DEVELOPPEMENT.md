# OnLinePrep — Stratégie de développement (v1)

Documents liés : `design-system/DESIGN.md` · `replica/recon.md` · `replica/features.csv` · `docs/PROMPTS_CLAUDE_CODE.md` · `docs/CRITIQUE_ET_QUESTIONS.md`.
Base : CDC v3.0 (49 p.). Les identifiants EXM/PED/SYN/PAY… renvoient à ce CDC.

## 1. Verdict en 6 lignes

1. Construire **web (PWA) d'abord**, puis **Android**, puis **iOS** : c'est l'ordre du CDC (L1 puis L2) et le seul qui permet de tester vite.
2. Un seul backend : **Supabase** (Postgres + Auth + Storage + Edge Functions). Front web et admin sur **Vercel**. Code sur **GitHub**.
3. Le cœur pédagogique (révision espacée, notation, composition de séance) est du **TypeScript pur** partagé web/mobile : testé une fois, utilisé partout.
4. Le **contenu** (questions vérifiées par des experts) est le vrai chemin critique, pas le code (CDC §19).
5. Le paiement Mobile Money et la boutique (Play/App Store) sont des **décisions externes** : le code les isole derrière des adaptateurs.
6. Ce que Claude peut faire seul : code, schéma, tests, dépôt GitHub. Ce que Claude ne peut pas faire depuis cette session : créer vos comptes Supabase/Vercel/Apple/Google, payer, saisir des clés (voir §10).

## 2. Architecture (choix et alternative rejetée)

| Couche | Choix | Pourquoi / alternative écartée |
|---|---|---|
| Monorepo | pnpm + Turborepo | CDC §8 : partage domaine et contrats |
| Web apprenant + admin | Next.js (App Router), TypeScript, Tailwind avec `tokens.css` | PWA hors ligne via service worker + IndexedDB |
| Mobile | **Expo (React Native)** + `expo-sqlite` | CDC §8 ; une enveloppe web (type Median/MedQuiz) risque un rejet Apple « fonctionnalité minimale » et n'offre pas le vrai hors ligne |
| Domaine partagé | `packages/domain` (TS pur) | Boîtes 1-2-4-7-14, composition 50/30/20, scoring, ordonnanceur ; aucune API d'appareil |
| Contrats | `packages/contracts` (Zod → OpenAPI) | API-01 |
| Base | Supabase Postgres, migrations SQL versionnées, **RLS partout** | CDC : « contraintes en base » |
| Auth | Supabase Auth, téléphone + OTP | **SMS : fournisseur à choisir** (Q4) ; repli e-mail |
| Logique serveur | Edge Functions (Deno) : sync, paiement, webhooks | Idempotence (clé d'événement) |
| Tâches | Postgres (`pgmq`/cron) + outbox | CDC §8 |
| Fichiers | Supabase Storage, URLs signées | Aucun bucket public pour du contenu privé |
| Paiement | Adaptateur `PaymentProvider` ; Notch Pay en 1er candidat | S11/S12 du CDC, à valider |
| Observabilité | Sentry + logs expurgés | SEC-01 |
| CI | GitHub Actions : lint, types, tests, contraste, RLS | REC-02 |

**Alternative écartée :** Capacitor/enveloppe web pour accélérer. Gain : ~3 semaines. Risque : rejet App Store (règle « fonctionnalité minimale ») et hors ligne fragile. À reconsidérer seulement si le budget ne permet pas deux bases de code ; le domaine partagé en TypeScript réduit déjà ce coût.

## 3. Structure du dépôt

```
apps/web         Next.js : /(learn) apprenant, /admin back-office
apps/mobile      Expo (Android L1, iOS L2)
packages/domain  scheduler, session-builder, scoring (pur, 100 % testé)
packages/contracts  schémas Zod + OpenAPI
packages/tokens  design-system/tokens.json → css + ts
supabase/        migrations/, seed/, functions/, tests/rls/
design-system/   (existe déjà)
replica/ docs/   (existent déjà)
```

## 4. Lots, durées indicatives, conditions de sortie

| Lot | Contenu | Durée solo + Claude Code | Sortie (tests CDC) |
|---|---|---|---|
| **L0** Cadrage | Décisions D01–D12, 3 prototypes (hors ligne Android 2 Go, Safari iOS, achat), 30 questions écrites de bout en bout | 3–4 sem. | ARC-01, mesure de capacité éditoriale |
| **L1a** Web + backend | Auth OTP, diagnostic, séance du jour, correction, progrès, sync, admin éditorial, offres gratuites | 6–8 sem. | T01–T07, T10 |
| **L1b** Paiement + Android | Mobile Money, droits, rapprochement, app Expo hors ligne | 5–7 sem. | T08, T09, T11, T12, T15, T16 |
| **Pilote** | 50 candidats × 2 sem. | 3–4 sem. | MET-01 (activation 48 h ≥ 60 %, hypothèse) |
| **L2** iOS | Portage Expo, achat/restauration, TestFlight | 4–6 sem. | T18 |
| L3+ | 2e concours, IA, B2B | après preuves | — |

Les durées du CDC (190–300 j-h) supposent une équipe ; avec Claude Code, la production de **code** est plus rapide, mais **validation, contenu, paiement réel et revue des boutiques** ne le sont pas.

## 5. Modèle de données (extrait L1)

`profiles(user_id, display_name, age_band, locale)` · `devices` · `exams(id, country, track, year, date_status, official_source)` · `skills` · `questions` · `question_versions(id, question_id, stem, type, explanation, state, author_id, reviewer_id, approver_id, published_at)` — **immuable une fois publiée** · `options` · `attempts(id, user_id, device_id, blueprint_version, seed, mode)` · `response_events(event_id uuid PK, attempt_id, item_id, answer_revision, payload_hash, client_time, received_at, canonical_seq)` · `review_items(user_id, question_id, box, due_on)` · `offers` · `orders` · `payment_attempts` · `payment_events` · `entitlements(user_id, offer_version, starts_at, ends_at)` · `content_flags` · `audit_events` · `consents` · `data_requests`.
Règles : montants en **entiers XAF** (5 000 = 5 000 francs) ; dates `timestamptz` UTC ; jour pédagogique Africa/Douala ; RLS : un utilisateur ne lit que ses lignes, le contenu publié est lisible, l'écriture sensible passe par Edge Functions.

## 6. Ordre de construction (tranche verticale d'abord)

1. Tranche verticale : question seedée → réponse locale → sync → correction. Prouve la pile.
2. Domaine pur + tests (boîtes, séance 50/30/20, scoring).
3. Auth OTP + profils + RLS testées.
4. Hors ligne : paquets signés, file d'événements, idempotence (T11).
5. Admin éditorial à 4 rôles, signalement.
6. Paiement (adaptateur « faux » d'abord, vrai ensuite) + droits + rapprochement.
7. Android (Expo) en réutilisant le domaine ; puis iOS.

## 7. Qualité : ce qui doit être automatisé dès le premier jour

- Tests unitaires du domaine (propriétés : mêmes graines → mêmes séances).
- Tests RLS : un utilisateur A ne lit ni n'écrit rien de B (T07, T13).
- Contrat API ↔ client (T16). Contraste : `python3 design-system/scripts/contrast.py`.
- Test de charge 100 utilisateurs, 20 req/s (NFR-02) ; démarrage ≤ 4 s p95 sur Android 2 Go (NFR-01).
- Accessibilité : Lighthouse + TalkBack (T08).

## 8. Publication

- **Google Play** : compte développeur (frais uniques, ~25 USD) ; pour un compte personnel récent, **test fermé avec un nombre minimum de testeurs sur ~14 jours avant la production** (règle à revérifier dans la console, elle a changé en 2024). Politique de paiements : l'achat de biens numériques passe en principe par Play Billing ; la config « consommation seule, achat hors app » du CDC §10 est un compromis à valider avec la revue de politique.
- **Apple** : compte (~99 USD/an) ; TestFlight ; règle 3.1.1 (achats in-app pour contenus numériques) ; éviter l'enveloppe web (4.2). iOS n'avance que si le lot L2 est commandé.
- **Confidentialité** : politique en ligne, formulaire « sécurité des données » exact, suppression de compte dans l'app.

## 9. Coûts mensuels indicatifs (à confirmer sur les grilles en vigueur)

Supabase gratuit s'endort/limite ; en pilote payant prévoir l'offre Pro (~25 USD/mois). Vercel Hobby est réservé à un usage non commercial : prévoir l'offre Pro (~20 USD/mois/siège) dès les ventes. SMS OTP : variable, souvent le premier poste de dépense au Cameroun. Frais boutique et Mobile Money : CDC §19 (exemple 2 % + 1 %). Aucun de ces chiffres n'est un devis.

## 10. Ce que Claude peut et ne peut pas faire depuis cette session

| Peut | Ne peut pas |
|---|---|
| Écrire code, migrations SQL, tests, CI, docs | Créer les comptes Supabase, Vercel, Apple, Google Play, Notch Pay |
| Pousser sur GitHub (dépôt `smartacademy1506-arch/TEST`, branche de travail) | Saisir ou voir vos mots de passe et clés secrètes |
| Construire et tester localement (Node 22 présent) | Déployer sur Vercel/Supabase : **aucun connecteur Supabase/Vercel n'est branché ici** |
| Générer le guide pas-à-pas et les prompts | Soumettre aux boutiques à votre place |

Chemin recommandé : Claude Code **sur votre ordinateur** avec les CLI `supabase` et `vercel` connectés à vos comptes (guide : `docs/GUIDE_DEPLOIEMENT_ENFANT_5_ANS.pdf`).
