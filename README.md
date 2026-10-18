# OnLinePrep

Plateforme de préparation aux concours médicaux (Cameroun) — web, Android, iOS.
État : **phase de cadrage** (design system, reconnaissance, stratégie). Le code applicatif n'est pas encore généré.

| Livrable | Fichier |
|---|---|
| Design system (tokens, aperçu, règles, choix du logo) | `design-system/DESIGN.md`, `design-system/design-preview.html` |
| Vérification de contraste WCAG | `python3 design-system/scripts/contrast.py` |
| Reconnaissance des apps concurrentes | `replica/recon.md`, `replica/features.csv` |
| Stratégie de développement | `docs/STRATEGIE_DEVELOPPEMENT.md` |
| Prompts complets pour Claude Code | `docs/PROMPTS_CLAUDE_CODE.md` |
| Critique et questions ouvertes | `docs/CRITIQUE_ET_QUESTIONS.md` |
| Guide de déploiement « enfant de 5 ans » (25 p.) | `docs/GUIDE_DEPLOIEMENT_ENFANT_5_ANS.pdf` (source : `docs/guide/guide.html`) |

Aucun secret dans ce dépôt : les clés vont dans `.env.local` et dans les réglages Vercel/Supabase.
