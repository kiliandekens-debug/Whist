# Whist
## Vercel

`npm ci` puis `npm run build`. Le build utilise `SUPABASE_URL` et
`SUPABASE_PUBLISHABLE_KEY`. La clé publique Supabase est destinée au navigateur.
Les clés serveur et les identifiants de connexion restent hors du dépôt.

L’entrée Vercel `vercel/auth.mjs` connecte le propriétaire par lien e-mail avec
PKCE, puis charge le carnet. Ajouter l’URL Vercel exacte et le domaine final
aux Redirect URLs de Supabase Auth. Les e-mails nécessitent un expéditeur
configuré ou une adresse autorisée par le service SMTP par défaut de Supabase.

L’Edge Function vérifie la session auprès de Supabase Auth et retrouve le
propriétaire autorisé dans `whist_account_access`. Cette table est privée avec
RLS et accès limité au service serveur. La configuration du propriétaire se
fait directement dans Supabase, sans adresse personnelle dans le dépôt.
Le proxy Vercel transmet uniquement le jeton Supabase et le contexte de
déploiement. Les aperçus utilisent un espace de sauvegarde distinct.

La version Sites conserve son authentification et son accès serveur existants.

## Synchronisation et hors connexion

`sw.js` garde une copie de l’application : le réseau est toujours utilisé quand
il répond, la copie ne sert que sans connexion. Sur Vercel, le carnet s’ouvre
alors avec les données de l’appareil, pour le dernier compte qui s’y est
connecté, et les modifications partent dès le retour du réseau.

En cas de conflit entre deux appareils, on choisit la version à garder. La
connexion par e-mail ne crée pas de compte : celui du propriétaire doit exister
dans Supabase Auth.

## Tests

`npm test` vérifie le barème, le répertoire de joueurs et la synchronisation.

## Versions

Le numéro de version est dans `package.json` et s’affiche en bas de
l’application (avec le commit sur les aperçus Vercel). Pour publier une
version : `npm version patch`, `minor` ou `major` selon le changement, puis
ajouter son entrée en tête de `CHANGELOG.md`. `npm test` vérifie que les deux
correspondent.
