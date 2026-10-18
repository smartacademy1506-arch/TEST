# Reconnaissance — apps concurrentes (méthode replica-recon, clean-room)

Statut : **sources publiques uniquement** (fiches Google Play, consultées le 18 oct. 2026). Aucune app n'a été installée ni observée en usage, aucun code ou API privée n'a été lu. Les écrans ci-dessous sont **inférés** des descriptions ; ils doivent être confirmés par l'utilisateur sur son propre téléphone (captures dans `replica/screens/`, jamais livrées).

## 1. Périmètre

| | |
|---|---|
| Apps | **MedQuiz** (`co.median.android.xkkrnd`, éditeur J & S Technologies) et **Med Prepa** (`com.eservice.medprepa`, éditeur e-Services) |
| Plateforme | Android (fiches Play) |
| Tranche à reproduire | La boucle centrale : s'entraîner sur des QCM par matière, lire la correction, revenir. Pas le forum, pas la vidéo. |
| Pour qui | OnLinePrep : candidats au concours d'entrée en médecine au Cameroun (CDC §2) |

Attention : le lien 1 est **MedQuiz** (outil construit avec Median.co, un convertisseur de site web en app). Ce n'est pas une app native.

## 2. Sources

| Source | URL | Ce qu'elle apporte |
|---|---|---|
| Fiche Play MedQuiz | https://play.google.com/store/apps/details?id=co.median.android.xkkrnd | Pitch, public, fonctionnalités, déclaration de données, mise à jour 24 août 2025, 1 k+ téléchargements |
| Fiche Play Med Prepa | https://play.google.com/store/apps/details?id=com.eservice.medprepa | Pitch, 10 k+ téléchargements, mise à jour 24 mai 2026, notes de version |
| Site Med Prepa | https://www.med-prepa.com/ | Non consultable : erreur de certificat TLS au moment de l'étude. À revoir à la main. |
| Captures des fiches | (images dans les fiches Play) | À ouvrir par l'utilisateur pour compléter l'inventaire d'écrans |

## 3. Ce que disent les fiches (faits)

**MedQuiz** : « plus de 1000 questions », étudiants de la 1re à la 5e année **et** préparation de l'ENSCT/ECN ; questions classées par matière et difficulté ; explication détaillée de chaque question ; interface épurée. Annoncé « à venir » : suivi des progrès, questionnaires personnalisés. Données : nom, e-mail, téléphone, messages et activité collectés ; partage possible avec des tiers ; stockage via **Glide et Notion** ; politique de confidentialité hébergée sur une page Notion.

**Med Prepa** : « premier groupe de préparation au concours de médecine 100 % en ligne » ; cours, questions de TD, anciens sujets, **forum de discussion** ; déclare ne collecter aucune donnée ; notes de version récentes : « Optimize loading time », « Improve MCQ display » → les deux irritants connus sont la **lenteur** et **l'affichage des QCM**.

## 4. Inventaire d'écrans (inféré)

| ID | Écran | Objectif | États à construire (OnLinePrep) |
|---|---|---|---|
| S01 | Accueil / Aujourd'hui | Séance du jour, prochaine action | nouveau compte, date inconnue, hors ligne |
| S02 | Liste des matières | Choisir une matière | vide, paquet à télécharger |
| S03 | Question | Lire, répondre | sauvegardée en local, image absente, signalement |
| S04 | Correction | Explication, prochaine révision | fiche absente, question retirée |
| S05 | Anciens sujets / épreuves | Concours blanc | interruption, reprise, temps écoulé |
| S06 | Cours / fiches | Lire un résumé | recherche sans résultat |
| S07 | Progrès | Voir ses forces et lacunes | non évalué, données limitées |
| S08 | Inscription / connexion | Créer un compte | OTP expiré, numéro recyclé |
| S09 | Abonnement / paiement | Débloquer | en attente, confirmé, refusé |
| S10 | Forum (Med Prepa) | Discuter | **exclu** de L1 (CDC §3.3) |
| S11 | Compte et aide | Appareils, confidentialité, support | suppression demandée |
| S12 | Admin (web séparé) | Contenu, offres, support | par rôle |

## 5. Parcours

- **F01 Découvrir sans compte** : S01 → S02 → S03 (diagnostic 15 questions) → S04 → inscription (S08). Cible : **≤ 5 appuis** avant la première question.
- **F02 Séance du jour (hors ligne)** : S01 → S03 ×20 → S04 → S07. Cible : 0 attente réseau.
- **F03 Payer** : S09 → paiement Mobile Money hébergé → droits actifs ≤ 60 s après preuve serveur (PAY-01..04).
- **F04 Épreuve chronométrée** : S05 → S03 … → score serveur.
- **F05 Publier une question** : S12 (auteur → relecteur → pédagogie → publié).

## 6. Composants

Bouton, champ, OTP, option de réponse, carte de question, jauge, pastille de maîtrise, bannière hors ligne, pastille de paquet, navigation basse, modale, toast, état vide, squelette — spécifiés dans `design-system/DESIGN.md`.

## 7. Modèle de données inféré (confiance moyenne)

Matière → question (énoncé, 4-5 options, bonne réponse, explication, difficulté) ; utilisateur ; réponse ; abonnement. MedQuiz s'arrête là. Le CDC ajoute : versions immuables, compétences, boîtes de révision, tentatives, droits, commandes (cf. `docs/STRATEGIE_DEVELOPPEMENT.md` §5).

## 8. Où OnLinePrep fait mieux (angle)

| Faiblesse constatée | Réponse OnLinePrep |
|---|---|
| MedQuiz : enveloppe web (Median), données dans Notion/Glide, partage à des tiers, aucune synchro | Vraie app + Postgres + RLS, minimisation des données, politique claire (PRV-01/02) |
| Med Prepa : lenteur et affichage QCM signalés | Paquets locaux, question en cache ≤ 1 s, mise en page de QCM testée sur Android 2 Go |
| Aucun suivi réel (« à venir ») | Diagnostic + boîtes de révision 1-2-4-7-14 j + progression honnête |
| Pas d'hors ligne annoncé | Hors ligne de bout en bout (SYN-01..07) |
| Banque non vérifiée | Workflow éditorial à 4 rôles, versions, signalement (EDT) |
| Aucun cadre de paiement visible | Mobile Money, machine à états financière (PAY) |

## 9. Ce qui ne se copie pas

Leurs questions et cours (droits d'auteur), leurs utilisateurs et leur forum (réseau), leur marque. OnLinePrep écrit ses propres questions : **le contenu est le chemin critique, pas le code** (CDC §19).

## 10. Taille

Écrans : 12 · parcours : 5 · entités : ~25 · parties difficiles : hors ligne + synchronisation, paiement Mobile Money, contenu vérifié. Taille : **L** (un trimestre à 1-2 personnes pour web + Android), iOS en plus : **M**.

Prochaine étape : `docs/STRATEGIE_DEVELOPPEMENT.md`.
