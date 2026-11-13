# Journal des versions

Chaque version mise en ligne a une entrée ici. Le numéro affiché en bas de
l’application vient de `package.json`.

- Premier chiffre : changement qui modifie les données ou les habitudes.
- Deuxième chiffre : nouvelle fonctionnalité.
- Troisième chiffre : correction.

## 1.9.2 — 2026-11-13

### Modifié
- Rikiki : la saisie des plis s’ouvre toute seule après les annonces.
- Rikiki : les plis qui ne sont plus un choix se remplissent tout seuls (dernier joueur, ou zéro pour tous quand tous les plis sont attribués).

## 1.9.1 — 2026-11-13

### Modifié
- Rikiki : les annonces s’ouvrent toutes seules au lancement de la partie et après chaque donne.
- Rikiki : le chiffre interdit au donneur est grisé.
- Saisie des pseudos : la fiche du joueur remonte en haut de l’écran pour que les suggestions restent visibles au-dessus du clavier.

## 1.9.0 — 2026-11-13

### Ajouté
- Mode Rikiki, de 2 à 8 joueurs : annonces puis plis à chaque donne, nombre de cartes qui monte et redescend, points réglables, contrainte du donneur, classement séparé.

## 1.8.1 — 2026-11-13

### Modifié
- Le carnet s’ouvre tout de suite avec les données de l’appareil ; la vérification en ligne se fait en arrière-plan.

## 1.8.0 — 2026-11-12

### Ajouté
- Accueil : résultat de la dernière partie et, dès deux parties terminées, podium du classement général.

### Modifié
- Bas de page plus net : état de la sauvegarde avec un voyant, actions du compte en boutons discrets.

## 1.7.0 — 2026-11-12

### Ajouté
- Code QR du lien de suivi, à faire scanner autour de la table.

## 1.6.0 — 2026-11-12

### Ajouté
- Lien de suivi : les autres joueurs suivent la partie en direct, en lecture seule et sans compte.
- Mode sombre, automatique selon l’appareil ou choisi avec le bouton « Thème » en bas de page.
- Installation sur l’écran d’accueil avec nom, icône et couleurs propres, y compris sur Android.
- « Mot de passe oublié ? » sur l’écran de connexion.

## 1.5.0 — 2026-11-12

### Ajouté
- Rappel de l’ordre des couleurs (cœur, carreau, trèfle, pique) dans la saisie d’un score.

## 1.4.1 — 2026-11-12

### Modifié
- Image de partage redessinée : vainqueur mis en avant, classement, évolution des scores et coup de la partie.

## 1.4.0 — 2026-11-12

### Ajouté
- Classement général des joueurs : parties, victoires, points cumulés et moyenne par partie.
- Graphique d’évolution des scores, donne après donne, dans chaque partie.
- Partage du résultat d’une partie terminée, en image et en texte.

### Modifié
- Barème : gain et perte, ainsi que pli en plus et pli manquant, se règlent séparément pour tous les contrats.

## 1.3.0 — 2026-11-12

### Ajouté
- Suppression d’une partie de l’historique, avec confirmation.

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
