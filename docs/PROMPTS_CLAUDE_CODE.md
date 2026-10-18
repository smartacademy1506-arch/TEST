# Prompts complets pour Claude Code — OnLinePrep

Mode d'emploi : copier un prompt à la fois, dans l'ordre. Chaque prompt est autonome, a des critères d'acceptation et se termine par un commit. Ne passer au suivant que si les vérifications sont vertes. Ne jamais coller de clé secrète dans un prompt : elles vont dans `.env.local` et dans les réglages Vercel/Supabase.

## P0 — Fichier `CLAUDE.md` à placer à la racine du dépôt

```
# OnLinePrep — règles permanentes
- Produit : préparation au concours d'entrée en médecine (Cameroun). Source de vérité fonctionnelle : docs/ + replica/features.csv. CDC v3.0 (identifiants EXM, PED, SYN, PAY, SEC…).
- Langue de l'interface et des messages : français. Code et commits : anglais.
- Design : uniquement les variables de design-system/tokens.css ; aucun hex brut dans les composants. WCAG 2.2 AA, cible tactile ≥ 48 px, jamais la couleur seule.
- Domaine pur dans packages/domain (aucune dépendance appareil/réseau), 100 % testé.
- Argent : entiers XAF. Dates : timestamptz UTC ; jour pédagogique Africa/Douala.
- Sécurité : RLS sur toute table ; le serveur calcule score, prix et droits ; aucun secret dans le code, les logs ou le client.
- Interdit : promettre un classement ou une probabilité de réussite ; copier du contenu d'un concurrent ; stocker un jeton long dans localStorage.
- Avant chaque commit : pnpm lint && pnpm typecheck && pnpm test. Commits Conventional Commits.
```

## P1 — Initialiser le monorepo

```
Lis CLAUDE.md, docs/STRATEGIE_DEVELOPPEMENT.md et replica/features.csv.
Crée un monorepo pnpm + Turborepo avec : apps/web (Next.js App Router, TypeScript strict, Tailwind), packages/domain, packages/contracts, packages/tokens, supabase/.
Configure ESLint, Prettier, Vitest, un workflow GitHub Actions (lint, typecheck, test, python3 design-system/scripts/contrast.py), .env.example (noms de variables seulement : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PAYMENT_PROVIDER, PAYMENT_WEBHOOK_SECRET, SMS_PROVIDER).
packages/tokens : script qui lit design-system/tokens.json et génère tokens.css et tokens.ts ; mappe-les dans tailwind.config.
Charge la police Lexend en auto-hébergement (sous-ensemble latin) via next/font.
Acceptation : pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build passent ; la page /design reproduit design-system/design-preview.html avec de vrais composants ; budget de la route d'accueil ≤ 1,5 Mo compressé. Commit.
```

## P2 — Bibliothèque de composants (design system en code)

```
Implémente dans apps/web/components/ui (base Radix ou React Aria) : Button (primary, secondary, gold, danger, loading, disabled), Field + ErrorMessage, OtpInput (6 cases, collage, lecteur d'écran), AnswerOption (neutral, selected, correct, wrong, avec icône + texte masqué pour lecteur d'écran), QuestionCard, SessionProgress (role=progressbar), MasteryChip (4 états, icône + texte + couleur), OfflineBanner, PackBadge, BottomNav (4 entrées : Aujourd'hui, Entraînement, Progrès, Bibliothèque), Modal, Toast, EmptyState, Skeleton.
Chaque composant : clavier complet, focus visible 3 px, 48 px minimum, mode clair/sombre, prefers-reduced-motion, test Testing Library + test axe.
Route /design en liste tous les états. Prends une capture à 360 px et 1280 px, clair et sombre, et compare à design-system/design-preview.html.
Acceptation : 0 violation axe ; 0 hex brut (grep) ; captures jointes. Commit.
```

## P3 — Schéma Supabase et sécurité (RLS)

```
Utilise le skill backend-design et replica-architect. À partir de docs/STRATEGIE_DEVELOPPEMENT.md §5, écris les migrations SQL dans supabase/migrations : tables, clés étrangères avec règle ON DELETE explicite, index sur chaque FK et colonne filtrée, contraintes CHECK sur les statuts, timestamptz partout, montants en entiers, question_versions immuables après publication (trigger), exclusion des doublons de response_events par event_id.
Active RLS sur TOUTES les tables. Écris supabase/tests/rls : l'utilisateur A ne peut ni lire ni écrire les lignes de B (profils, tentatives, réponses, commandes, droits) ; le contenu publié est lisible ; le brouillon ne l'est pas ; un client ne peut pas s'attribuer un droit.
Ajoute seed/ avec 30 questions FICTIVES marquées « démo » en français (biologie, physique, chimie), 3 compétences, 2 offres test.
Acceptation : supabase db reset passe ; tests RLS verts (ils doivent échouer si on retire une politique : prouve-le). Commit.
```

## P4 — Domaine pédagogique (le cœur)

```
Dans packages/domain, en TypeScript pur sans I/O :
1) scheduler : 5 boîtes aux délais 1, 2, 4, 7, 14 jours ; première erreur → boîte 1 ; première réussite → boîte 2 (due J+2) ; réussite ultérieure → +1 boîte ; erreur → retour à 1 ; boîte 5 réussie → 14 jours ; jour pédagogique Africa/Douala ; une révision en retard reste due et n'est pas échec ; plafond de prochaine échéance à J-2 de la date d'examen CONFIRMÉE seulement (PED-02).
2) sessionBuilder : 20 questions (réductible à 10), 50 % dues / 30 % compétences prioritaires / 20 % consolidation ; arrondis par plus grands restes ; pas de doublon ; quotas d'accès ; complète avec les autres catégories, puis nouveau contenu ; si banque insuffisante, séance plus courte annoncée ; déterministe pour une graine donnée (PED-03).
3) diagnostic : 15 questions ; « non évalué » / « à confirmer » si trop peu d'items indépendants ; jamais de pourcentage (PED-01).
4) masteryIndicator : EMA m = 0,7·m_prec + 0,3·résultat ; libellés « à travailler / en progression / résultats encourageants » avec nombre de questions distinctes ; les répétitions ne gonflent pas le nombre d'items indépendants (PED-04).
5) scoring : score recalculé depuis les réponses finales, jamais depuis un booléen client ; règle explicite pour les questions sans réponse.
Tests : cas T04 et T05 du CDC (boîte vide, rien d'échu, banque de 6 questions, dernière semaine avant concours, absence de date, changement de fuseau), tests par propriété (même graine, même résultat). Couverture 100 % du paquet.
Commit.
```

## P5 — Auth téléphone + OTP et profils

```
Implémente l'inscription par numéro (format international E.164) avec Supabase Auth OTP : code 6 chiffres, 5 minutes, 5 essais, renvoi après 60 s, 3 envois/heure/numéro ; un nouveau défi invalide l'ancien ; réponse identique que le compte existe ou non ; limitation par IP adaptée aux réseaux partagés. Le fournisseur SMS est derrière une interface SmsProvider (variable SMS_PROVIDER) ; fournis un faux fournisseur pour les tests.
Sessions révocables, liste des appareils, déconnexion maîtrisée. Web : cookie Secure + HttpOnly + SameSite + protection CSRF, jamais de jeton long dans localStorage (ACC-03).
Le diagnostic doit démarrer SANS compte (identifiant d'installation aléatoire), puis fusion transactionnelle à l'inscription avec choix « conserver ou effacer » (ACC-01).
Écrans : S08 avec états OTP expiré, rejeté, numéro recyclé. Tests T07. Commit.
```

## P6 — Parcours apprenant (web)

```
Construis les écrans Aujourd'hui, Entraînement (par matière/compétence), Question, Correction, Progrès, Bibliothèque (fiches), Compte et aide, avec tous les états de CDC §6.2 (nouveau compte, date inconnue, contenu indisponible, hors ligne, banque insuffisante, quota atteint…).
Question : énoncé lisible 16 px minimum, formules accessibles (KaTeX/MathML), images avec texte alternatif, option sélectionnable clavier/tactile, enregistrement local AVANT de dire « sauvegardée », signalement d'une question. Correction : explication + distracteurs commentés + prochaine révision.
Progrès : synthèse texte en plus de tout graphique ; aucune probabilité de réussite.
Accessibilité : T08 (clavier, zoom 200 %, contraste). Commit.
```

## P7 — Hors ligne et synchronisation

```
Web : IndexedDB (Dexie) + service worker (Workbox) ; gérer QuotaExceededError ; demander navigator.storage.persist() ; afficher dernière synchro.
Paquets : manifeste signé (package_id, version, schema_version, taille, SHA-256, langue, retraits) ; téléchargement en zone temporaire, vérification d'intégrité puis bascule atomique ; une interruption laisse l'ancienne version utilisable.
File d'événements : event_id, account_id, device_id, attempt_id, item_id, answer_revision, payload_hash, client_time, version. Edge Function /sync : accusé individuel (accepté, déjà reçu, rejeté avec motif, à réessayer), même clé + même contenu = même résultat, même clé + contenu différent = conflit documenté, ordre canonique côté serveur. Backoff plafonné avec jitter.
Droit hors ligne : permis signé lié au compte/appareil/contenu, 7 jours maximum.
Tests T11 : 100 réponses hors ligne, coupure en plein lot, doublons, accusé perdu, ordre inversé, horloge reculée, changement de compte, disque plein ; puis 10 000 événements côté serveur. Commit.
```

## P8 — Back-office éditorial et support

```
Route /admin (MFA obligatoire, comptes individuels, rôles : auteur, relecteur, responsable pédagogique, support, finance, exploitation, direction). Workflow : brouillon → à relire → revue disciplinaire (relecteur ≠ auteur) → validation pédagogique (autre personne) → publiée ; retrait/suspension avec motif. Une correction publiée crée une nouvelle version, conserve les tentatives et déclenche un recalcul tracé (EDT-05).
Import CSV/JSON avec erreurs par ligne, rien d'importé si partiellement incohérent (T03). Journal d'audit de toute action sensible. Support : vues limitées, identité masquée.
Tests T10 et T13 (permissions en autorisation ET en refus, y compris exports et recherches). Commit.
```

## P9 — Paiement Mobile Money (adaptateur)

```
Définis l'interface PaymentProvider (createPayment, getPayment, verifyWebhook, refund). Implémente d'abord FakeProvider, puis le fournisseur retenu (Notch Pay à valider, voir CDC S11/S12) — clés dans les variables d'environnement, jamais dans le code.
Machine à états (CDC §10.3) : commande figée (offre, montant entier XAF, devise, bénéficiaire, échéance, version CGV, canal) ; plusieurs tentatives possibles ; webhook vérifié (HMAC SHA-256 sur les octets exacts, comparaison à temps constant, déduplication) ; succès confirmé = transaction unique {droit + événement outbox} ; webhook perdu → vérification serveur à serveur + rapprochement quotidien ; signature invalide → aucun droit ; événement ancien après remboursement → ne réactive pas ; double débit → un seul produit + dossier de remboursement ; remboursement avec double approbation.
Le payeur n'obtient aucun accès aux résultats du bénéficiaire. URL de paiement sans donnée personnelle.
Tests T12 (succès, refus, attente, webhook absent/dupliqué/falsifié, montant différent, délai expiré, double débit, crash base puis reprise). Commit.
```

## P10 — App Android (Expo)

```
Crée apps/mobile (Expo, TypeScript, expo-router, expo-sqlite, expo-secure-store). Réutilise packages/domain et contracts ; NativeWind ou StyleSheet alimenté par packages/tokens.
Écrire chaque réponse dans SQLite dans une transaction AVANT le message « sauvegardée » ; file + paquets + permis comme en P7. Prototype ARC-01 d'abord : séance hors ligne sur un Android 2 Go, mesurer démarrage à froid p95 ≤ 4 s et question en cache ≤ 1 s (30 essais).
Rappel quotidien local (opt-in, heures calmes). Build : eas build (profil preview → APK pour testeurs, production → AAB). Pas de secret dans le binaire.
Acceptation : T08, T11, T15 sur l'appareil de référence ; rapport joint. Commit.
```

## P11 — Sécurité, confidentialité, publication

```
Utilise les skills security-review, ecc:security-scan et replica-deploy.
1) Revue OWASP ASVS (niveau nommé et versionné) : dépendances, secrets, autorisations IDOR, mass-assignment, en-têtes, limitation de débit.
2) Page politique de confidentialité et CGU (français), choix facultatifs séparés (PRV-02), suppression de compte avec révocation de sessions/droits, export (PRV-03), test de restauration de sauvegarde avec réapplication des suppressions (T14).
3) Fiche Google Play : texte, formulaire « sécurité des données » exact, captures, icône 512 (design-system/assets/icons), image de présentation (logo avec slogan).
4) Check-list de pré-vol replica-deploy ; aucun déploiement sans mon accord.
Livrable : docs/SECURITE.md et docs/PUBLICATION.md. Commit.
```

## P12 — Déploiement (à lancer sur votre ordinateur, comptes connectés)

```
Suis docs/GUIDE_DEPLOIEMENT_ENFANT_5_ANS. Crée le projet Supabase de PRODUCTION (séparé du développement), applique les migrations avec supabase db push, configure les variables d'environnement dans Vercel (jamais dans le dépôt), connecte le dépôt GitHub à Vercel (main → production, PR → aperçu), configure le domaine, l'alerte d'erreurs et un contrôle de disponibilité. Effectue le parcours complet sur le site en ligne et donne-moi la checklist de ce que je dois vérifier sur mon téléphone.
```

## Boucle d'amélioration à ajouter après chaque prompt

```
Critique ton propre travail contre CLAUDE.md et les identifiants du CDC concernés : liste les écarts, corrige-les, relance les vérifications, puis résume ce qui reste à décider par moi (questions numérotées avec ta recommandation par défaut).
```
