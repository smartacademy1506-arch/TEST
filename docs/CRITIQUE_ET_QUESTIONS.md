# Critique et questions ouvertes

## A. Critique de mon propre travail (et corrections déjà faites)

| # | Constat | Action |
|---|---|---|
| 1 | L'or du logo (#D99A14) n'a que **2,45:1** sur blanc : inutilisable pour du texte ou des jauges. | Corrigé : or texte `#9A6700` (4,87:1), or graphique `#B9780A`. |
| 2 | Le texte d'avertissement or sur or clair tombait à **4,29:1**. | Corrigé : `#8A5A00`. Script `contrast.py` : 0 échec clair et sombre. |
| 3 | Une étiquette de l'aperçu (blanc sur or 600) était à **3,65:1**. | Corrigé : texte marine. |
| 4 | Les logos sont des **images raster générées**, avec dégradé métallique ; pas de SVG. | Non corrigé : nécessite un graphiste (vectorisation, variante blanche, recherche d'antériorité OAPI). |
| 5 | Le lien 1 est **MedQuiz** (enveloppe Median.co), pas une app native ; je n'ai pu consulter que les **fiches Play**, pas les écrans réels ; le site med-prepa.com a une erreur TLS. | Recon marquée « inféré » ; vous devez ouvrir les apps et m'envoyer des captures pour la compléter. |
| 6 | Le CDC garde l'orange `#F5A623` + bleu `#1F4E79` ; le logo est marine + or. | J'ai fait primer le logo (Q2). |
| 7 | Depuis cette session je **ne peux pas déployer** sur Supabase/Vercel (aucun connecteur) ni acheter, ni saisir vos clés. | Prompt P12 et guide pour exécuter sur votre ordinateur. |
| 8 | Le CDC dit lui-même qu'il ne suffit pas pour un forfait : budget, équipe, contenu, canal de paiement non tranchés. | Questions ci-dessous. |
| 9 | Promesse « gain de rang » de l'ancienne version : le CDC la retire. | Appliqué dans le design (aucune probabilité, aucun classement national). |

## B. Critique du CDC v3.0 (utile pour vos décisions)

- **Pas d'iOS en L1** : cohérent, mais votre objectif Play Store **et** Apple Store impose de commander L2 explicitement (D10).
- **Date du concours** : l'arrêté consulté fixe le 4 sept. 2026 (déjà passée). Sans date confirmée, pas de compte à rebours ni d'expiration automatique.
- **Contenu** : 600 heures de rédaction pour 800 questions (hypothèse CDC). Sans experts disciplinaires, l'app est vide. C'est le vrai risque.
- **Google Play** : vendre des biens numériques hors Play Billing est risqué ; le compromis « consommation seule » du CDC doit être validé par la revue de politique.
- **Mineurs** : la loi 2024/017 exige un régime d'autorisation ; un avis juridique local est indispensable avant d'ouvrir à de vrais utilisateurs.

## C. Questions pour vous (avec ma recommandation par défaut)

| N° | Question | Ma recommandation |
|---|---|---|
| Q1 | Qui écrit et valide les questions (noms, matières) ? Avez-vous 30 questions pilotes ? | Commencer par 30 questions originales validées avant tout lancement payant |
| Q2 | Logo vs anciennes couleurs : je garde marine + or du logo et j'abandonne l'orange du CDC ? | Oui |
| Q3 | Quel concours exactement en premier (médecine uniquement) et quelle session ? | Médecine, session à confirmer officiellement |
| Q4 | SMS pour l'OTP : fournisseur et budget ? Accepter WhatsApp/e-mail en repli ? | OTP SMS + repli e-mail ; fournisseur à comparer |
| Q5 | Paiement : Mobile Money MTN/Orange via Notch Pay, ou autre ? Avez-vous une entité légale pour le compte marchand ? | Notch Pay en adaptateur, validation KYC d'abord |
| Q6 | Play Store : paiement dans l'app (Play Billing) ou web seulement ? | Web seulement au départ, à valider avec Google |
| Q7 | Apple : budget 99 USD/an et un Mac (ou service de build cloud) ? | Oui, après le pilote Android |
| Q8 | Vous travaillez seul ou en équipe ? Budget total et délai ? | À préciser pour calibrer les lots |
| Q9 | Nom légal, domaine, entité qui publie sur les stores ? | À fixer avant création des comptes |
| Q10 | Vous disposez d'un ordinateur pour lancer Claude Code avec vos comptes ? | Oui : c'est la voie de déploiement |
| Q11 | Y a-t-il des anciens sujets dont vous détenez les droits ? | Sinon : questions originales uniquement |
| Q12 | Langue : français seul au départ ? | Oui |
