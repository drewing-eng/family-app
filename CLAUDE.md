# CLAUDE.md

Ce fichier guide Claude Code (claude.ai/code) sur ce dépôt. GAUTIER Family est
l'application familiale unifiée qui regroupe la gestion des menus, la gestion
des stocks et, plus tard, la gestion financière.

Documents de référence produits pendant le cadrage (accès selon permissions) :
- PRD : https://claude.ai/code/artifact/04789319-d6fc-4878-b962-ec90cd638fae
- Aperçu cliquable (sidebar/wall, modules, thèmes) : https://claude.ai/code/artifact/af15fa9d-90c6-47bf-abeb-66219a709896

## Commandes

```bash
npm install       # installe les dépendances
npm run dev       # serveur de dev Vite, http://localhost:5173
npm run build     # build de production dans dist/
npm run start     # sert dist/ via Express (ce que fait le conteneur Docker)
```

`npm run dev` retombe sur `VITE_POCKETBASE_URL` (voir `.env.example`) — en
pratique pointe vers `https://pb.libaxio.com` (voir "Infra VPS" ci-dessous).

**Avant de tester l'auth en local ou en prod** : le compte utilisé doit avoir
`role`, `apps_autorisees` et `theme` renseignés dans PocketBase — ces champs
n'ont pas de valeur par défaut. Un compte sans `apps_autorisees` ne verra que
le Wall (comportement volontaire, voir "Rôles & auth" ci-dessous).

## Vision

Un seul foyer numérique : un mur familial (Family Wall) comme accueil mobile,
une sidebar comme navigation sur ordinateur, et trois modules derrière —
Menus, Stocks et Finances (celui-ci plus tard). Détail complet dans le PRD
lié ci-dessus ; ce fichier documente ce qui est *implémenté* et les décisions
qui ne doivent pas être révisées sans discussion explicite.

## Infra VPS (confirmée)

- **PocketBase** : https://pb.libaxio.com — instance en ligne, superadmin
  créé côté utilisateur (je n'ai pas ces identifiants). Collection `users`
  déjà étendue avec `role` (select : `admin`/`membre`/`invite`),
  `apps_autorisees` (select multiple : `wall`/`menus`/`stocks`/`finances`) et
  `theme` (select : `clair`/`sombre`).
- **App** : en ligne sur `https://family.libaxio.com`, même reverse proxy que
  family-menu et PocketBase.
- **Déploiement** : voir "Déploiement" ci-dessous — Watchtower + ghcr.io,
  aucune étape manuelle après le bootstrap initial (déjà fait).

## Architecture

**Hébergement** — Docker self-hosted, même pattern que family-menu (réseau
`npm_default` externe pour le reverse proxy géré côté serveur, hors de ce
dépôt).

**Frontend** — Vite + JavaScript vanilla (pas de TypeScript, pas de
framework), modules ES natifs. Vite est un choix délibéré : contrairement à
family-menu et Chest_gestion (aucun build), GAUTIER Family a assez de
surface (auth, 3 modules, thèmes) pour justifier un bundler léger — mais pas
plus (pas de React/Vue, pas de state manager). Routage par hash
(`#/wall`, `#/menus`, `#/stocks`) plutôt qu'un vrai routeur — suffisant pour
3 vues, pas de librairie ajoutée pour ça.

**Backend** — [PocketBase](https://pocketbase.io) : auth + toutes les
données. C'est un service séparé (son propre conteneur, sa propre instance),
pas géré dans ce dépôt. Ce dépôt ne fait que s'y connecter en client HTTP via
le SDK `pocketbase`.

**Config runtime vs build-time** — l'URL PocketBase ne doit *pas* être figée
au build (la même image Docker doit pouvoir pointer vers des instances
différentes sans reconstruction) :
- Dev (`npm run dev`) : `VITE_POCKETBASE_URL` dans `.env` (Vite l'inline au build/dev).
- Prod (Docker) : `server.js` expose `/config.js`, généré à la requête à
  partir de `process.env.POCKETBASE_URL`, qui pose `window.__POCKETBASE_URL__`.
  `src/lib/pocketbase.js` lit `window.__POCKETBASE_URL__` en priorité, puis
  `import.meta.env.VITE_POCKETBASE_URL` en repli.
- `index.html` charge `/config.js` avant le bundle. Sous `vite dev`, cette
  route n'existe pas (404 silencieux) — normal, le repli `.env` prend le relais.

**PWA** — scaffoldée au chantier 2 : `public/manifest.webmanifest`,
`public/sw.js` (cache l'app shell uniquement, jamais les requêtes vers
PocketBase ni `/config.js` — voir commentaire dans le fichier), icône en
**SVG** (`public/icon.svg`), pas en PNG. Le contenu binaire ne peut pas être
transmis de façon fiable par les outils de commit texte utilisés dans cette
session ; si un vrai jeu d'icônes PNG est nécessaire un jour (surtout pour un
rendu iOS plus fidèle), il faudra les déposer autrement (upload direct,
build step dédié) plutôt que via un commit texte.

## Déploiement

**Pipeline** — `.github/workflows/docker-publish.yml` : à chaque push sur
`main` ou `claude/family-app-consolidation-mndn7r`, build l'image et la
pousse sur `ghcr.io/drewing-eng/family-app:latest` (calqué sur le workflow
de family-menu).

**Sur le VPS** — Watchtower tourne déjà et surveille les images ghcr.io
(comme pour family-menu) : une fois le conteneur démarré, il se met à jour
tout seul à chaque nouvelle image, sans intervention manuelle.

**Bootstrap initial** — fait (app en ligne sur `family.libaxio.com`,
`.env` avec `POCKETBASE_URL=https://pb.libaxio.com` en place sur le VPS).

## Structure du dépôt

```
index.html                point d'entrée Vite (manifest, icône, /config.js)
src/main.js                bootstrap : thème par défaut, boot(), service worker
src/lib/pocketbase.js      client PocketBase (auth, session, thème, rôle/apps)
src/lib/theme.js           application du data-theme (jamais implicite)
src/views/login.js         écran de connexion
src/views/shell.js         coquille : sidebar/wall, navigation, contenu par module
src/styles/tokens.css      design tokens (voir "Design system" ci-dessous)
src/styles/global.css      reset + styles de base + coquille + login
server.js                  serveur Express de prod (sert dist/ + /config.js)
public/manifest.webmanifest, sw.js, icon.svg   PWA
Dockerfile                  build multi-stage (vite build → image Express)
docker-compose.yml          déploiement self-hosted, réseau npm_default
.github/workflows/          pipeline ghcr.io (voir "Déploiement")
```

## Design system

**Repris à l'identique de family-menu, branche `main`
(`public/style.css`).** Voir `src/styles/tokens.css` pour les valeurs exactes.

⚠️ **Piège déjà rencontré pendant le cadrage** : le dépôt family-menu a
plusieurs branches avec des designs différents et obsolètes (un thème
crème/terracotta/Georgia serif, abandonné). Si le design de family-menu doit
être re-consulté, **toujours vérifier la branche `main` en premier** — ne pas
se fier à la première branche trouvée.

Résumé du design réel :
- Fond blanc, texte quasi-noir (`#111110`), accent indigo (`#5b5bd4`).
- Typo système sans-serif, grasse sur les titres, tracking négatif serré
  (`-0.02em` à `-0.03em`) — **aucune police serif nulle part**.
- Cartes : coins très arrondis (18px), ombre douce, **aucune bordure**.
- Navigation : bouton actif en pilule noire pleine (`#111110` bg, blanc),
  reste en texte gris (`--text-muted`). Repris pour `.side-item.active` via
  les tokens `--nav-active-bg`/`--nav-active-fg` (qui s'inversent en sombre).
- Cartes "repas" Midi (vert pâle `--midi-bg`) / Soir (violet pâle
  `--soir-bg`) — vocabulaire réservé pour le widget "menu du jour" du Wall
  (chantier 4, pas encore construit).
- Badges et indicateurs de statut : pilules colorées (`--accent-light`,
  `--green-light`, `--orange-light`, `--red-light`, `--blue-light`).

**Mode sombre** — n'existe pas dans family-menu (family-menu est 100% clair).
C'est une extension propre à GAUTIER Family, dérivée manuellement des tokens
clairs (voir le bloc `[data-theme="dark"]` dans `tokens.css`). Toujours
**ouvrir l'app en clair par défaut**, jamais suivre `prefers-color-scheme`
silencieusement au premier chargement — l'inverse a produit un rendu jugé
"horrible" pendant le cadrage. Implémenté au chantier 2 : `src/lib/theme.js`
pose toujours `data-theme` explicitement (jamais l'attribut absent), et
`main.js` applique le thème du profil PocketBase dès qu'il est connu ; le
choix est persisté via `updateTheme()` (`pocketbase.js`) sur le champ
`theme` de l'utilisateur.

⚠️ **Pièges CSS rencontrés au chantier 2** (à garder en tête pour la suite) :
- Un conteneur flex à deux mises en page (sidebar+contenu sur desktop,
  header+contenu empilés sur mobile) a besoin de `flex-direction: column`
  par défaut et `row` seulement au-delà du breakpoint desktop — l'inverse
  (row par défaut) casse silencieusement la mise en page mobile sans erreur
  console, seul un test visuel le révèle.
- Deux règles CSS de même spécificité qui ciblent le même élément (ex. une
  classe utilitaire `.mobile-only { display: none }` en media query, et une
  classe de composant `.tiles { display: grid }` non conditionnelle) se
  départagent par **l'ordre d'écriture dans le fichier**, pas par la media
  query — la dernière règle déclarée gagne toujours. Solution retenue :
  un wrapper dédié (`.mobile-modules`) qui ne porte que la logique
  d'affichage, jamais partagé avec une classe qui fixe aussi un `display`.
- Les deux ont été trouvés par une capture d'écran Playwright avant le push,
  pas par relecture de code — utile de garder ce réflexe pour la suite.

## Décisions verrouillées (ne pas revenir dessus sans décision produit explicite)

- **Navigation à deux niveaux** : niveau app = sidebar sur ordinateur / Family
  Wall comme hub sur mobile (pas de barre d'onglets globale en bas sur
  mobile). Niveau module = barre secondaire type onglets, en haut sur
  ordinateur / en bas sur mobile (ex. Stocks : Gestion / Journal / Catalogue,
  pas encore construite — arrive avec le module lui-même au chantier 3).
- **Rôles** : Admin (accès total + gestion des comptes), Membre (écriture sur
  tout sauf l'admin), Invité (lecture seule). Chaque utilisateur a en plus un
  champ "applications ouvertes" (multi-sélection des modules visibles),
  indépendant du rôle.
- **Wall et Finances échappent à `apps_autorisees`** (précision apportée au
  chantier 2, pas explicite dans le PRD d'origine) : le Wall est toujours
  accessible (c'est le point d'entrée, pas un module qu'on peut retirer) ;
  Finances est toujours visible dans la nav mais désactivée pour tout le
  monde (aucune valeur de `apps_autorisees` ne la débloque, le module
  n'existe pas encore). Seuls Menus et Stocks sont réellement filtrés.
- **Par défaut, aucun module optionnel visible** : si `apps_autorisees` est
  vide/absent sur un compte, l'utilisateur ne voit que le Wall (défaut
  restrictif, pas permissif) — pense à le renseigner sur chaque compte créé.
- **Stocks** : pas d'event-sourcing façon Chest_gestion. État stocké
  directement (collections `coffres`/`emplacements` à jour en temps réel) +
  collection `historique` en lecture seule pour la traçabilité, non rejouable.
  Seuil "Stock en tension" = quantité restante < 20 % du maximum catalogue
  pour cet emplacement. Pas de suivi de qui a fait quelle action (pas un
  besoin exprimé).
- **Menus** : intégré en iframe (pas un lien externe simple). Tant que l'URL
  de production de family-menu n'est pas fournie, afficher un état "Connexion
  à créer".
- **Finances** : entrée de navigation visible mais désactivée/"à venir" —
  aucun développement avant que ce chantier soit explicitement lancé.
- **Chest_gestion** : continue de tourner en prod (Cloudflare) en parallèle,
  inchangé. Un fork sert de référence de départ pour le module Stocks, mais
  le code de ce module est réécrit (nouveau design, PocketBase) — pas un
  import direct du Worker Cloudflare.

## Rôles & auth (PocketBase)

Implémenté au chantier 2 :
- `src/views/login.js` — formulaire email/mot de passe, appelle
  `pb.collection('users').authWithPassword`.
- `src/main.js` — au démarrage, `refreshSession()` revalide le token côté
  serveur (`authRefresh`) et efface la session locale si le compte a été
  désactivé/supprimé entretemps ; réaffiche alors l'écran de login.
- `src/views/shell.js` — filtre la nav par `apps_autorisees`, affiche le
  rôle en badge dans le profil (sidebar desktop), gère la déconnexion.
- Pas encore fait : aucun écran de gestion des comptes (création
  d'utilisateurs) — reste à faire à l'admin PocketBase directement pour
  l'instant, une UI dédiée n'est pas dans le périmètre du chantier 2.

`catalogue`, `coffres`, `emplacements`, `historique` — chantier 3 (module
Stocks), schéma détaillé dans le PRD, pas encore créés dans PocketBase.

## Roadmap (chantiers)

- [x] **Chantier 1 — Fondations** : structure du repo, Vite + Express +
      client PocketBase, Docker/docker-compose, ce CLAUDE.md.
- [x] **Chantier 2 — Coquille applicative** : auth PocketBase réelle, sidebar
      desktop / Family Wall mobile, mode sombre par profil, manifest PWA.
- [ ] **Chantier 3 — Module Stocks** : collections PocketBase, CRUD
      coffres/emplacements/catalogue, badge "stock en tension".
- [ ] **Chantier 4 — Module Menus & Family Wall** : iframe family-menu,
      widgets menu du jour + alertes stock sur le Wall.
- [ ] **Chantier 5 — Sécurisation** : règles d'API PocketBase par
      collection/rôle, durcissement de l'admin PocketBase, revue des sessions.
- [ ] **Chantier 6 — Module Finances** (plus tard, hors périmètre actuel).

## Points encore ouverts

- URL de production de family-menu, pour l'iframe (chantier 4).
- Détail fin des règles d'API PocketBase par rôle (chantier 5) — pour
  l'instant, les règles par défaut de PocketBase s'appliquent (à durcir).
- Icônes PWA en SVG plutôt qu'en PNG (voir "PWA" ci-dessus) — acceptable
  pour l'instant, à revoir si le rendu iOS pose problème en usage réel.
- Pas encore testé avec un vrai compte utilisateur en conditions réelles
  (le chantier 2 a été validé avec un état d'authentification simulé en
  local, jamais un vrai login contre `pb.libaxio.com`, pour ne pas risquer
  de perturber l'instance de prod avec des tentatives de connexion factices).

## Simplicité délibérée

Pas de TypeScript, pas de framework, pas de suite de tests pour l'instant —
cohérent avec family-menu et Chest_gestion. Vite est la seule concession
outillage, justifiée par la taille de l'app (voir "Architecture" ci-dessus).
Ne pas introduire de framework ou de state manager sans que cette décision
soit revisitée explicitement.
