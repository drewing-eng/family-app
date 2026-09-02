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

**Avant de tester le module Stocks** : les collections `catalogue`,
`coffres`, `emplacements`, `historique` doivent exister dans PocketBase — je
ne peux pas les créer moi-même (pas de superadmin). Schéma exact dans
"Modèle de données PocketBase" ci-dessous.

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
le SDK `pocketbase`. **Seul le superadmin PocketBase peut créer/modifier des
collections** — un compte applicatif avec `role = "admin"` (notre propre
champ) n'a aucun pouvoir sur le schéma, seulement sur les données. Toute
évolution du schéma passe donc par une instruction à l'utilisateur, jamais
par un appel API de ma part.

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
src/lib/stocks.js          accès données Stocks (catalogue/coffres/emplacements/historique)
src/views/login.js         écran de connexion
src/views/shell.js         coquille : sidebar/wall, navigation, sous-onglets de module
src/views/stocks.js        module Stocks : Gestion/Journal/Catalogue, dialogues
src/styles/tokens.css      design tokens (voir "Design system" ci-dessous)
src/styles/global.css      reset + styles de base + coquille + login + Stocks
server.js                  serveur Express de prod (sert dist/ + /config.js)
public/manifest.webmanifest, sw.js, icon.svg   PWA
Dockerfile                  build multi-stage (vite build → image Express)
docker-compose.yml          déploiement self-hosted, réseau npm_default
.github/workflows/          pipeline ghcr.io (voir "Déploiement")
```

## Modèle de données PocketBase — module Stocks (à créer par le superadmin)

Pas d'event-sourcing façon Chest_gestion (décision verrouillée) : état stocké
directement, `historique` en écriture seule pour la traçabilité.

**Collection `catalogue`**
| Champ | Type | Options |
|---|---|---|
| `nom` | Text | requis |
| `quantite_max` | Number | requis, min 1 |

**Collection `coffres`**
| Champ | Type | Options |
|---|---|---|
| `nom` | Text | requis |
| `nb_emplacements` | Number | requis, min 1 |

**Collection `emplacements`**
| Champ | Type | Options |
|---|---|---|
| `coffre` | Relation → `coffres` | requis, une seule sélection, cascade delete activé |
| `index` | Number | requis, min 1 |
| `article` | Relation → `catalogue` | optionnel (emplacement vide autorisé), une seule sélection |
| `quantite` | Number | requis, défaut 0, min 0 |

**Collection `historique`**
| Champ | Type | Options |
|---|---|---|
| `emplacement` | Relation → `emplacements` | requis, une seule sélection, **cascade delete désactivé** (l'historique doit survivre à la suppression d'un coffre/emplacement) |
| `coffre_nom` | Text | requis (dénormalisé, pour rester lisible même si le coffre est supprimé) |
| `article_nom` | Text | requis (dénormalisé, idem) |
| `type` | Select | requis, une seule sélection, valeurs : `ajout`, `retrait` |
| `quantite` | Number | requis (le delta, toujours positif — `type` donne le sens) |

`created` (horodatage) est un champ système PocketBase, pas besoin de le
créer manuellement.

**Règles d'API** (onglet "API Rules" de chaque collection) — appliquent déjà
la distinction de rôles pendant que le vrai chantier de sécurisation
(chantier 5) n'est pas encore fait :
- `catalogue`, `coffres`, `emplacements` : List/View = `@request.auth.id != ""` ;
  Create/Update/Delete = `@request.auth.role = "admin" || @request.auth.role = "membre"`.
- `historique` : List/View = `@request.auth.id != ""` ;
  Create = `@request.auth.role = "admin" || @request.auth.role = "membre"` ;
  Update/Delete = laissés vides (personne, y compris via l'app — traçabilité
  non modifiable ; une correction reste possible directement dans l'admin
  PocketBase si vraiment nécessaire).

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
  reste en texte gris (`--text-muted`). Repris pour `.side-item.active` et
  `.tab-btn.active` (sous-onglets de module) via les tokens
  `--nav-active-bg`/`--nav-active-fg` (qui s'inversent en sombre).
- Cartes "repas" Midi (vert pâle `--midi-bg`) / Soir (violet pâle
  `--soir-bg`) — vocabulaire réservé pour le widget "menu du jour" du Wall
  (chantier 4, pas encore construit).
- Badges et indicateurs de statut : pilules colorées (`--accent-light`,
  `--green-light`, `--orange-light`, `--red-light`, `--blue-light`). Le badge
  "Stock en tension" (module Stocks) réutilise ce vocabulaire (`.gluco.eleve`).

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

⚠️ **Pièges CSS rencontrés (à garder en tête pour la suite)** :
- Un conteneur flex à deux mises en page (sidebar+contenu sur desktop,
  header+contenu empilés sur mobile) a besoin de `flex-direction: column`
  par défaut et `row` seulement au-delà du breakpoint desktop — l'inverse
  (row par défaut) casse silencieusement la mise en page mobile sans erreur
  console, seul un test visuel le révèle. (Chantier 2.)
- Deux règles CSS de même spécificité qui ciblent le même élément (ex. une
  classe utilitaire `.mobile-only { display: none }` en media query, et une
  classe de composant `.tiles { display: grid }` non conditionnelle) se
  départagent par **l'ordre d'écriture dans le fichier**, pas par la media
  query — la dernière règle déclarée gagne toujours. Solution retenue :
  un wrapper dédié qui ne porte que la logique d'affichage, jamais partagé
  avec une classe qui fixe aussi un `display`. Appliqué deux fois :
  `.mobile-modules` (chantier 2) et `.subtabs-desktop`/`.subtabs-mobile`
  avec `:not(:empty)`/`:empty` plutôt qu'un `display` inline en JS
  (chantier 3) — **ne jamais piloter la visibilité responsive depuis le JS
  avec `.style.display = ...`, toujours en CSS pur**, comme `.sidebar`/
  `.mobile-header` le font déjà.
- Ces bugs ont été trouvés par des captures d'écran Playwright avant le
  push, pas par relecture de code — garder ce réflexe pour la suite.

## Décisions verrouillées (ne pas revenir dessus sans décision produit explicite)

- **Navigation à deux niveaux** : niveau app = sidebar sur ordinateur / Family
  Wall comme hub sur mobile (pas de barre d'onglets globale en bas sur
  mobile). Niveau module = barre secondaire type onglets, en haut sur
  ordinateur / en bas sur mobile — implémenté pour Stocks (Gestion / Journal
  / Catalogue) au chantier 3, réutilisable tel quel par un futur module.
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
  directement (`emplacements.quantite`) + collection `historique` en
  écriture seule pour la traçabilité, non rejouable (règles Update/Delete
  vides, voir "Modèle de données" ci-dessus). Seuil "Stock en tension" =
  quantité restante < 20 % du maximum catalogue pour cet emplacement. Pas de
  suivi de qui a fait quelle action (pas un besoin exprimé). Ajuster un
  emplacement fixe une **quantité absolue** (pas un delta relatif ajout/
  retrait séparé) — plus simple côté UI, le delta est calculé et tracé dans
  l'historique automatiquement.
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
  l'instant, une UI dédiée n'est pas dans le périmètre actuel.

Module Stocks (chantier 3) : voir "Modèle de données PocketBase" ci-dessus
pour le détail des collections et de leurs règles d'API par rôle.

## Roadmap (chantiers)

- [x] **Chantier 1 — Fondations** : structure du repo, Vite + Express +
      client PocketBase, Docker/docker-compose, ce CLAUDE.md.
- [x] **Chantier 2 — Coquille applicative** : auth PocketBase réelle, sidebar
      desktop / Family Wall mobile, mode sombre par profil, manifest PWA.
- [x] **Chantier 3 — Module Stocks** : collections PocketBase (schéma
      documenté, à créer par le superadmin), CRUD coffres/emplacements/
      catalogue, badge "stock en tension", journal en lecture seule.
- [ ] **Chantier 4 — Module Menus & Family Wall** : iframe family-menu,
      widgets menu du jour + alertes stock sur le Wall.
- [ ] **Chantier 5 — Sécurisation** : durcissement de l'admin PocketBase,
      revue des sessions (les règles d'API par collection/rôle sont déjà
      posées au fil des chantiers, à auditer plutôt qu'à créer de zéro).
- [ ] **Chantier 6 — Module Finances** (plus tard, hors périmètre actuel).

## Points encore ouverts

- **Collections Stocks pas encore créées côté PocketBase** — schéma exact
  dans "Modèle de données PocketBase" ci-dessus, à faire par le superadmin
  avant de pouvoir tester le module en conditions réelles.
- URL de production de family-menu, pour l'iframe (chantier 4).
- Audit complet des règles d'API PocketBase par rôle (chantier 5) — les
  règles de base sont posées collection par collection au fil des
  chantiers, mais pas encore revues dans leur ensemble.
- Icônes PWA en SVG plutôt qu'en PNG (voir "PWA" ci-dessus) — acceptable
  pour l'instant, à revoir si le rendu iOS pose problème en usage réel.
- Pas encore testé avec un vrai compte utilisateur en conditions réelles
  (chantiers 2 et 3 validés avec un état PocketBase simulé en local, jamais
  contre `pb.libaxio.com`, pour ne pas perturber l'instance de prod avec des
  tentatives/données factices).

## Simplicité délibérée

Pas de TypeScript, pas de framework, pas de suite de tests pour l'instant —
cohérent avec family-menu et Chest_gestion. Vite est la seule concession
outillage, justifiée par la taille de l'app (voir "Architecture" ci-dessus).
Ne pas introduire de framework ou de state manager sans que cette décision
soit revisitée explicitement.
