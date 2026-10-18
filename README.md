# OnLinePrep

Plateforme de préparation aux concours médicaux (Cameroun) — web, Android, iOS.
État : **fondations livrées** — design system, reconnaissance, stratégie, domaine pédagogique testé et base de données sécurisée. L'application web et l'application mobile restent à construire (prompts P1, P2, P5 à P8, P10 dans `docs/PROMPTS_CLAUDE_CODE.md`).

```bash
pnpm install
pnpm check        # typage + 73 tests (domaine, sécurité base de données) + contraste WCAG
```

| Livrable | Fichier |
|---|---|
| Design system (tokens, aperçu, règles, choix du logo) | `design-system/DESIGN.md`, `design-system/design-preview.html` |
| Vérification de contraste WCAG | `python3 design-system/scripts/contrast.py` |
| Reconnaissance des apps concurrentes | `replica/recon.md`, `replica/features.csv` |
| Domaine pédagogique (boîtes 1-2-4-7-14, séance 50/30/20, maîtrise, diagnostic, score) | `packages/domain` (40 tests) |
| Base Supabase : schéma, RLS, fonctions idempotentes, jeu de démo | `supabase/migrations`, `supabase/seed.sql` |
| Tests de sécurité de la base (Postgres embarqué) | `packages/db-tests` (33 tests) |
| Stratégie de développement | `docs/STRATEGIE_DEVELOPPEMENT.md` |
| Prompts complets pour Claude Code | `docs/PROMPTS_CLAUDE_CODE.md` |
| Critique et questions ouvertes | `docs/CRITIQUE_ET_QUESTIONS.md` |
| Guide de déploiement « enfant de 5 ans » (25 p.) | `docs/GUIDE_DEPLOIEMENT_ENFANT_5_ANS.pdf` (source : `docs/guide/guide.html`) |

Aucun secret dans ce dépôt : les clés vont dans `.env.local` et dans les réglages Vercel/Supabase.
