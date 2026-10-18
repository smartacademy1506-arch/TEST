# OnLinePrep — Design System v1.0

Palette officielle : **bleu `#1F4E79` + orange `#F5A623`** (couleurs du CDC UX-02, choix confirmé par l'utilisateur le 18 oct. 2026). Structure issue du logo et du CDC v3.0. Source de vérité des valeurs : `tokens.json` → `tokens.css`.
Vérification : `python3 design-system/scripts/contrast.py` (0 échec AA attendu). Aperçu : `design-preview.html`.

## 1. Choix du logo (décision et critique)

| Variante | Décision | Pourquoi |
|---|---|---|
| 01 Mot-symbole gras + symbole | **Principal** | Graisse forte : tient sous 120 px sur écran bas de gamme ; croix + pouls + flèche + barres = « médecine + progression mesurée », exactement la promesse du CDC. |
| 04 Horizontal + slogan FR | **Héros web, fiche Play/App Store, e-mails** | Le slogan « Préparer aujourd'hui les médecins de demain » ne se lit pas sous ~240 px de large : jamais dans l'app. |
| Symbole seul (extrait de 01) | **Icône d'app, favicon, splash** | Fond plein, sans transparence (exigence iOS). Fichiers : `assets/icons/`. |
| 02 Graisse légère | Réserve | Même dessin, trait fin : se dégrade en petit. |
| 03 / 05 Caducée + « P » | **Écarté** | Se lit « IP » (pas « OP ») ; le serpent disparaît à 48 px ; deux slogans différents (05) ; plus générique « santé » que « concours ». |

Réserves à lever avant publication (voir `docs/CRITIQUE_ET_QUESTIONS.md`) :
1. Les 5 logos sont des **images raster** (1254 px) : il faut une version **vectorielle (SVG)** par un designer, et une recherche d'antériorité de marque (OAPI pour le Cameroun) avant dépôt.
2. Le dégradé métallique de la croix n'est pas reproductible en petit : utiliser la version **aplat** (`--orange-500`) en interface.
3. Fond clair uniquement : prévoir une variante **monochrome blanc** pour les fonds bleus.

Zone de protection : hauteur du « O » autour du logo. Taille minimale : symbole 24 px ; mot-symbole 96 px ; avec slogan 240 px.

## 2. Couleurs

Bleu `#1F4E79` = action et structure. Orange `#F5A623` = progression et mise en valeur (comme la flèche du logo).

| Rôle | Clair | Sombre |
|---|---|---|
| Fond / surface | `#FFFFFF` / `#F3F7FB` | `#0A1F33` / `#12324F` |
| Texte / atténué | `#12324F` / `#4A6076` | `#F3F7FB` / `#B7C7D9` |
| Action | `#1F4E79` avec texte blanc | `#F8BC55` avec texte `#0A1F33` |
| Texte orange | `#9A5C00` (5,38:1) | `#F8BC55` |
| Graphique or (jauges) | `#B86E00` | `#F8BC55` |
| Succès / Danger | `#0F7B4F` / `#B3261E` | `#4CC38A` / `#FF8A80` |
| Focus | `#1F6FEB` | `#7DB2FF` |

**Pièges corrigés pendant l'audit :** l'orange #F5A623 n'offre que 2,03:1 sur blanc, donc interdit pour du texte et pour des jauges sur blanc (d'où `--highlight-graphic`) ; le texte d'avertissement or sur fond or clair était à 4,29:1 (corrigé en `#8A5200`).
**Décision utilisateur (18 oct. 2026) : on garde les couleurs du CDC**, bleu `#1F4E79` et orange `#F5A623`, au lieu du marine/or exact du logo. Conséquence à traiter : le logo (marine `#0A2A5E`, or dégradé) est un peu plus sombre et plus jaune que l'interface. Deux options pour le graphiste : (a) recolorer le logo aux deux valeurs ci-dessus (recommandé, cohérence totale) ; (b) garder le logo tel quel sur fond blanc, en accord de teinte. Les noms de tokens sont `--blue-*` et `--orange-*`. L'orange `#F5A623` n'offre que ~2:1 sur blanc : il reste réservé aux aplats avec texte bleu foncé dessus ; le texte orange utilise `--orange-700`.

## 3. Typographie

**Lexend** (conçue pour réduire la fatigue de lecture), 400/500/700, auto-hébergée en sous-ensemble latin (budget CDC : web ≤ 1,5 Mo compressé). Repli `system-ui`. Échelle 12 · 14 · 16 · 20 · 28 · 40. Corps 16 px minimum ; texte agrandissable à 200 % (test T08).

## 4. Principes pédagogiques d'interface (issus du CDC)

1. **Jamais la couleur seule** : chaque état = icône + mot + couleur (UX-03).
2. **Incertitude visible** : « À confirmer · 3 questions » plutôt qu'un faux pourcentage (PED-01/04).
3. **Pas de promesse de rang** : aucune probabilité de réussite au concours.
4. **Fraîcheur et hors-ligne visibles** : bannière + date de paquet (SYN-04/07).
5. **Cible tactile ≥ 48 px**, navigation à 4 entrées : Aujourd'hui · Entraînement · Progrès · Bibliothèque (UX-01).
6. **Mouvement réduit, mode sombre, taille de texte** réglables (UX-03).
7. **Ton** : tutoiement chaleureux, phrases courtes, zéro jargon marketing, pas d'hyperbole médicale.

## 5. Composants à livrer (cf. aperçu)

Bouton (primaire, secondaire, or, danger, désactivé, chargement) · Champ + erreur · Saisie OTP · Option de réponse (neutre/sélectionnée/juste/fausse) · Carte de question · Jauge de séance · Pastille de maîtrise · Bannière hors-ligne · Pastille de paquet · Navigation basse · En-tête · Feuille modale · Toast · État vide · Squelette de chargement.
Chaque composant : clavier, lecteur d'écran, focus visible 3 px, 48 px, états défaut/focus/désactivé/erreur.

## 6. Icônes, images, formules

Lucide (MIT) pour les icônes. Images de questions avec texte alternatif obligatoire (CNT-02). Formules en MathML/KaTeX accessibles. Illustrations originales uniquement.

## 7. Mise en œuvre

- Tailwind : mapper `tokens.css` dans `theme.extend.colors` (`bg-surface`, `text-muted`, `bg-accent`) ; **aucun hex brut dans les composants**.
- React Native : générer `tokens.ts` depuis `tokens.json` (script `pnpm tokens`), mêmes noms de rôles.
- Prompt de génération côté Claude Code : voir `docs/PROMPTS_CLAUDE_CODE.md`, prompt P2.
