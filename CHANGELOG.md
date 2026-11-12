# Journal des versions

Chaque version mise en ligne a une entrée ici. Le numéro affiché en bas de
l’application vient de `package.json`.

- Premier chiffre : changement qui modifie les données ou les habitudes.
- Deuxième chiffre : nouvelle fonctionnalité.
- Troisième chiffre : correction.

## 1.2.0 — 2026-11-12

### Ajouté
- Connexion par adresse e-mail et mot de passe. Le lien par e-mail reste disponible.
- Bouton « Mot de passe » en bas de page pour choisir ou changer son mot de passe.

### Corrigé
- Le lien par e-mail fonctionne à nouveau pour une première connexion.

## 1.1.0 — 2026-11-12

### Ajouté
- Le carnet s’ouvre sans connexion, avec les données gardées sur l’appareil.
- En cas de conflit entre deux appareils, choix de la version à garder.
- Numéro de version affiché en bas de l’application.
- Tests automatiques du barème, des joueurs et de la synchronisation.

### Corrigé
- Une sauvegarde lente n’est plus signalée comme un conflit.
- La synchronisation reprend seule au retour du réseau et à la réouverture de l’application.
- Les parties archivées avec le premier barème le conservent quand on corrige une donne.
- Session expirée et carnet trop volumineux ont leur propre message.
- L’écran du barème se met à jour après l’enregistrement.

### Modifié
- La connexion par e-mail ne crée plus de compte.
- La déconnexion ne demande confirmation que s’il reste des modifications non sauvegardées.

## 1.0.0 — 2026-11-11

Première version complète.

- Feuille de score à 4 ou 5 joueurs, avec donneur, mort et premier à parler.
- Barème modifiable, Piccolo en option, donnes doublées.
- Misères encodées comme gagnées ou perdues par déclarant.
- Répertoire de joueurs, pseudos, groupes, fiches et classements par contrat.
- Historique des parties, correction des scores, annulation d’une partie.
- Adresses directes pour chaque écran et navigation avec le bouton retour.
- Synchronisation en ligne avec Supabase et connexion du propriétaire par e-mail.
- Présentation pensée pour le mobile et l’écran d’accueil de l’iPhone.
