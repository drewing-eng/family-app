# CLAUDE.md

Ce fichier guide Claude Code (claude.ai/code) sur ce dépôt. GAUTIER Family est
l'application familiale unifiée qui regroupe la gestion des menus, la gestion
des stocks et, plus tard, la gestion financière.

Documents de référence produits pendant le cadrage (accès selon permissions) :
- PRD : https://claude.ai/code/artifact/04789319-d6fc-4878-b962-ec90cd638fae
- Aperçu cliquable initial (sidebar/wall, modules, thèmes — **design
  obsolète**, voir ci-dessous) : https://claude.ai/code/artifact/af15fa9d-90c6-47bf-abeb-66219a709896
- **Maquette de référence actuelle (cliquable, source de vérité visuelle) :**
  https://claude.ai/code/artifact/441c2f20-8e43-4697-96d3-fe904ae647ce —
  toute nouvelle interface doit d'abord y être comparée avant d'être codée ;
  détail complet des jetons et composants dans `design-systeme.md`.

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
`pieces`, `rangements`, `stocks` doivent exister dans PocketBase — je ne
peux pas les créer moi-même (pas de superadmin). Schéma exact dans "Modèle
de données PocketBase" ci-dessous.

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
src/lib/stocks.js          accès données Stocks (catalogue/pieces/rangements/stocks)
src/views/login.js         écran de connexion
src/views/shell.js         coquille : sidebar/wall, navigation, sous-onglets de module
src/views/stocks.js        module Stocks : Gestion (Pièce→Rangement) / Catalogue
src/styles/tokens.css      design tokens (voir "Design system" ci-dessous)
src/styles/global.css      reset + styles de base + coquille + login + Stocks
server.js                  serveur Express de prod (sert dist/ + /config.js)
public/manifest.webmanifest, sw.js, icon.svg   PWA
Dockerfile                  build multi-stage (vite build → image Express)
docker-compose.yml          déploiement self-hosted, réseau npm_default
.github/workflows/          pipeline ghcr.io (voir "Déploiement")
```

## Modèle de données PocketBase — module Stocks (à créer par le superadmin)

⚠️ **Ce modèle a remplacé un premier essai (coffres à emplacements indexés,
inspiré de Chest_gestion) jugé mal adapté à un usage maison — voir "Décisions
verrouillées" ci-dessous.** Les collections `coffres`/`emplacements`/
`historique` documentées dans une version précédente de ce fichier n'ont
jamais été créées côté serveur : rien à migrer, ce schéma-ci est le seul valide.

`quantite`/`quantite_cible` restent de simples nombres (pas de type "unité"
structuré, pas de conversion) — `catalogue.unite` est un texte libre optionnel
posé par article (g, kg, ml, L, pièces…), affiché tel quel partout où sa
quantité apparaît (catalogue, panel de tension, détail de rangement). Tant
qu'un article n'a pas ce champ renseigné, l'interface n'affiche simplement
aucune unité pour lui (aucun rappel générique — décision explicite, ce texte
gênait plus qu'il n'aidait).

⚠️ **`catalogue.unite` n'existe pas encore côté PocketBase** — comme pour le
reste du schéma, seul le superadmin peut l'ajouter (moi je ne peux pas). Le
code envoie déjà `unite` à la création/modification d'un article (PocketBase
ignore silencieusement un champ inconnu, donc rien ne casse en attendant) ;
il suffit d'ajouter le champ pour qu'il commence à être persisté et affiché.

**Collection `catalogue`**
| Champ | Type | Options |
|---|---|---|
| `nom` | Text | requis |
| `quantite_cible` | Number | requis, min 1 — le niveau "stock plein" pour cet article, toute la maison confondue |
| `unite` | Text | optionnel — unité affichée à côté des quantités de cet article (g, kg, ml, L, pièces…) — **à créer côté PocketBase, voir avertissement ci-dessus** |

**Collection `pieces`**
| Champ | Type | Options |
|---|---|---|
| `nom` | Text | requis (Cuisine, Salle de bain, Garage…) |

**Collection `rangements`**
| Champ | Type | Options |
|---|---|---|
| `nom` | Text | requis (Frigo, Placard du haut, Étagère…) |
| `piece` | Relation → `pieces` | **requis** (un rangement appartient toujours à une pièce — si besoin d'un rangement "libre", créer une pièce "Libre" dédiée), une seule sélection, cascade delete activé |

**Collection `stocks`**
| Champ | Type | Options |
|---|---|---|
| `rangement` | Relation → `rangements` | requis, une seule sélection, cascade delete activé |
| `article` | Relation → `catalogue` | requis, une seule sélection, cascade delete activé |
| `quantite` | Number | requis, défaut 0, min 0 |

Une ligne `stocks` = un article réellement présent dans un rangement. Pas
d'index, pas de capacité fixe, pas de ligne "vide" : on n'a une ligne que si
l'article y est. L'app empêche les doublons (rangement+article) côté client
(`upsertStock`) — si tu veux une garantie stricte côté PocketBase, tu peux
ajouter un index unique composite sur `stocks` (`rangement`, `article`) dans
l'admin, mais ce n'est pas indispensable.

`created` (horodatage) est un champ système PocketBase, pas besoin de le
créer manuellement.

**Règles d'API** (onglet "API Rules" de chaque collection), identiques sur
les 4 collections :
- List/View : `@request.auth.id != ""`
- Create/Update/Delete : `@request.auth.role = "admin" || @request.auth.role = "membre"`

## Design system

⚠️ **Le design a changé de direction après le chantier 3 — ce qui suit
remplace toute description précédente d'un design "repris à l'identique de
family-menu".** L'app ne partage plus la charte de family-menu (fond blanc
uni, accent indigo `#5b5bd4`, aucun mode chaleureux) : sur demande explicite
de l'utilisateur, GAUTIER Family a sa **propre** identité visuelle,
volontairement plus chaleureuse, avec une couleur d'accent différente par
module. `src/styles/tokens.css` est encore sur l'ancienne base family-menu
et **doit être réécrit** pour correspondre à ce qui suit avant tout nouveau
développement d'interface (pas encore fait — voir "Points encore ouverts").

**Référence complète (palette, typo, formes, composants, navigation,
tiroir) : voir `design-systeme.md` à la racine du dépôt.** Ce fichier-ci ne
donne qu'un résumé ; en cas de divergence, `design-systeme.md` fait foi, et
la maquette cliquable qu'il référence fait foi sur les deux.

Résumé très court :
- Police **Manrope** (Google Fonts), plus aucune police système.
- Couleur d'accent **par module**, pas une seule couleur pour toute l'app :
  bleu `#384CEA` (Accueil/Menus), orange `#C2660C` (Stocks), vert `#1F8F55`
  (Finances, à venir) — posée via un attribut `data-module` qui redéfinit
  trois jetons CSS (`--accent`, `--accent-soft`, `--canvas`), lus par tout
  le reste de l'UI.
- Rayons **généreux mais toujours rectangulaires** (jamais de pilule pleine
  sur un bouton/badge/nav — testé puis explicitement refusé), ombres quasi
  jamais utilisées, bordures quasi absentes (séparation par le fond, pas par
  un contour).
- Toutes les pop-up et `confirm()` natifs sont remplacés par un **tiroir**
  qui pousse le contenu sur desktop (carte flottante) et devient un
  **bottom-sheet** par-dessus le contenu sur mobile.
- Navigation mobile : Accueil est un **hub** (widgets + tuiles de modules),
  un module ouvert a une **croix persistante** (ferme vers le hub) et, si on
  descend d'un niveau, une **flèche de retour** séparée — jamais les deux au
  même endroit (bug rencontré et corrigé).
- **Aucun emoji dans l'interface**, uniquement des icônes trait SVG
  (`src/lib/icons.js`, style Feather/Lucide).

**Mode sombre** — dérivation générique posée dans `tokens.css`
(`:root[data-theme="dark"]`), jamais formellement validée visuellement dans
son ensemble par l'utilisateur (décision explicite : pas de nouvelle palette
sans validation, voir "Décisions verrouillées"). Un bug de cascade a été
corrigé : les blocs `#app[data-module="stocks"|"finance"]` avaient une
spécificité CSS plus forte que `:root[data-theme="dark"]` et gagnaient donc
toujours, même en sombre, faisant fuiter des fonds crème/pâles dans un
module par ailleurs sombre — ils sont maintenant scopés à
`html[data-theme="light"]`.

Déclinaison sombre par module : **Stocks a sa propre déclinaison validée**
(`html[data-theme="dark"] #app[data-module="stocks"]` — `--accent: #F5B38C`,
`--accent-soft: #523D2A`, proposées par l'utilisateur ; les fonds
`--canvas`/`--panel`/`--alt`/`--line` restent volontairement les valeurs
sombres génériques, pas de canvas teinté par module en sombre). **Finances
reste sur l'accent générique** (lavande) en sombre tant que la même
validation n'a pas eu lieu pour elle.

Ce qui reste vrai quel que soit l'état de la palette : toujours **ouvrir
l'app en clair par défaut**, jamais suivre `prefers-color-scheme`
silencieusement au premier chargement — l'inverse a produit un rendu jugé
"horrible" pendant le cadrage initial. `src/lib/theme.js` pose toujours
`data-theme` explicitement sur `<html>` (jamais l'attribut absent), et
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
  ordinateur / en bas sur mobile — implémenté pour Stocks (Gestion /
  Catalogue) au chantier 3, réutilisable tel quel par un futur module.
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
- **Stocks — modèle Pièce → Rangement → articles** (remplace un premier
  modèle "coffre à emplacements indexés" abandonné après relecture : c'était
  un inventaire de jeu vidéo — capacité fixe, slots numérotés — pas une
  gestion de stock maison, où une étagère n'a pas de "nombre de cases").
  - Un rangement appartient **toujours** à une pièce (contrainte assumée :
    pour un rangement "sans pièce", créer une pièce "Libre").
  - Une ligne de stock = (rangement, article, quantité), sans capacité fixe
    ni ligne vide — un rangement peut contenir autant d'articles différents
    que nécessaire, et un même article peut être présent dans plusieurs
    rangements à la fois.
  - **Pas d'historique/journal** : état fixe, on édite directement la
    quantité (décision explicite — "un état fixe est mieux" pour cet usage).
  - Seuil "Stock en tension" = **calcul global** : somme de la quantité d'un
    article dans **tous** les rangements de la maison, comparée à sa
    `quantite_cible` catalogue ; sous 20 % → tension. Pas de tension "par
    rangement".
  - Pas de suivi de qui a fait quelle action (pas un besoin exprimé).
  - Pas d'unité structurée par article (juste une mention dans l'UI — voir
    "Modèle de données" ci-dessus) ; évolution possible plus tard si besoin.
- **Menus** : intégré en iframe (pas un lien externe simple). Tant que l'URL
  de production de family-menu n'est pas fournie, afficher un état "Connexion
  à créer".
- **Finances** : entrée de navigation visible mais désactivée/"à venir" —
  aucun développement avant que ce chantier soit explicitement lancé.
- **Chest_gestion** : continue de tourner en prod (Cloudflare) en parallèle,
  inchangé — reste la référence pour Chest_gestion lui-même, mais son modèle
  de données n'est plus la base du module Stocks de GAUTIER Family (voir
  ci-dessus).

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
      Pièce → Rangement → articles, documenté, à créer par le superadmin),
      CRUD complet, badge "stock en tension" (calcul global), recherche +
      filtre par pièce + reset des filtres sur Gestion — Liste, jauge
      "% du catalogue hors tension" (desktop), unité par article
      (`catalogue.unite`, texte libre optionnel).
- [ ] **Chantier 4 — Module Menus & Family Wall** : iframe family-menu,
      widget menu du jour sur le Wall (bloqué sur l'URL de prod de
      family-menu — le Wall affiche un placeholder "Connexion à créer" en
      attendant). Widget "Stocks en tension" du Wall déjà fait (branché sur
      `lib/stocks.js:tensionItems()`, cliquable vers le module Stocks).
- [ ] **Chantier 5 — Sécurisation** : durcissement de l'admin PocketBase,
      revue des sessions (les règles d'API par collection/rôle sont déjà
      posées au fil des chantiers, à auditer plutôt qu'à créer de zéro).
- [ ] **Chantier 6 — Module Finances** (plus tard, hors périmètre actuel).

## Points encore ouverts

- **`src/styles/tokens.css` et `global.css` pas encore réécrits pour le
  nouveau design system** — voir `design-systeme.md` et la maquette
  cliquable qu'il référence. Tant que ce n'est pas fait, l'app déployée
  tourne encore sur l'ancienne base visuelle family-menu ; ne pas construire
  de nouvel écran sur les classes/tokens actuels de `global.css` sans
  d'abord les faire correspondre à la maquette.
- **Collections Stocks pas encore créées côté PocketBase** — schéma exact
  dans "Modèle de données PocketBase" ci-dessus, à faire par le superadmin
  avant de pouvoir tester le module en conditions réelles.
- **`catalogue.unite` pas encore créé côté PocketBase** — texte libre
  optionnel, voir "Modèle de données PocketBase" ci-dessus ; le code
  l'envoie déjà mais rien n'est persisté tant que le champ n'existe pas.
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
- Unité par article : évolution possible plus tard si le simple rappel
  textuel (g/kg/ml/L/pièces…) ne suffit plus à l'usage.

## Simplicité délibérée

Pas de TypeScript, pas de framework, pas de suite de tests pour l'instant —
cohérent avec family-menu et Chest_gestion. Vite est la seule concession
outillage, justifiée par la taille de l'app (voir "Architecture" ci-dessus).
Ne pas introduire de framework ou de state manager sans que cette décision
soit revisitée explicitement.
