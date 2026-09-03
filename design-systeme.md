# Design système — GAUTIER Family

**Maquette de référence (cliquable, source de vérité visuelle) :**
https://claude.ai/code/artifact/441c2f20-8e43-4697-96d3-fe904ae647ce

Toute nouvelle interface (nouvel écran, nouveau composant, adaptation d'un
module existant) doit d'abord être comparée à cette maquette avant d'être
codée. Si un cas n'y est pas couvert, on le maquette d'abord dans l'artefact
(ou un dérivé), on fait valider, *puis* seulement on code — jamais l'inverse.

Ce document remplace la section "Design system" historique de `CLAUDE.md`
(qui décrivait une reprise à l'identique de family-menu — fond blanc uni,
indigo `#5b5bd4`, pas de mode chaleureux). Cette base a été volontairement
abandonnée au profit de ce qui suit, décidé et itéré avec l'utilisateur.
**Toute évolution de palette, typo ou identité visuelle doit être validée
par l'utilisateur avant application — jamais une initiative de Claude seul**
(règle explicite, redite plusieurs fois pendant le cadrage).

## Police

**Manrope** (Google Fonts, poids 400/500/600/700/800), chargée via
`<link>` — pas de fallback système comme avant. Sans-serif géométrique et
arrondie, choisie précisément pour casser avec le "system-ui" neutre
hérité de family-menu et apporter le ton plus chaleureux demandé, tout en
restant une sans-serif stricte (aucune police serif, jamais).

## Couleur

### Jetons de base (Accueil, Menus)

| Jeton | Valeur | Usage |
|---|---|---|
| `--accent` | `#384CEA` | Boutons pleins, éléments actifs, jauges, barres de progression |
| `--accent-soft` | `#E5E8FC` | Fond des puces actives (nav), icônes en chip |
| `--canvas` | `#F3F5FB` | Fond de page — très pâle, presque blanc |
| `--panel` | `#FFFFFF` | Cartes/blocs qui flottent sur le canvas, sidebar |
| `--alt` | `#F5F6FC` | Fond secondaire : champs de formulaire, sous-blocs dans une carte, badges neutres |
| `--text` | `#1B2036` | Texte principal (quasi-noir, jamais du noir pur) |
| `--muted` | `#8B90A8` | Texte secondaire, labels, icônes inactives |
| `--line` | `#ECEEF8` | Séparateurs internes — quasi invisibles, jamais une vraie bordure |

Sémantiques, **séparées de l'accent** (ne changent jamais avec le module) :

| Jeton | Valeur | Usage |
|---|---|---|
| `--good` | `#2F9E58` | Indicateur factuel positif (ex. badge glucides "ok") |
| `--warn` | `#D2691E` | Indicateur d'alerte modérée (ex. barre de tension) |
| `--danger` | `#D64545` | Action destructive (bouton "Supprimer" dans la modale de confirmation) |

### Couleur par module

Chaque module a sa propre teinte pour `--accent`/`--accent-soft`/`--canvas` ;
comme **tout** le reste de l'UI (sidebar, boutons, badges, barres de
progression, jauges) référence déjà ces trois jetons plutôt que des couleurs
en dur, changer de module retinte automatiquement toute l'interface sans
toucher aux composants un par un.

| Module | Accent | Accent doux | Canvas |
|---|---|---|---|
| Accueil / Menus (défaut) | `#384CEA` | `#E5E8FC` | `#F3F5FB` |
| Stocks | `#C2660C` | `#FBE7D2` | `#FBF3E9` |
| Finances (à venir) | `#1F8F55` | `#DBF2E4` | `#EEF8F1` |

**Mécanisme** : un attribut `data-module="wall|menus|stocks|finance"` sur le
conteneur racine de l'app ; les jetons ci-dessus sont redéfinis par un
sélecteur `[data-module="…"]` en CSS. Le JS n'a qu'à poser cet attribut au
changement d'écran — aucun autre code de theming nécessaire. Voir la
maquette de référence pour l'implémentation exacte (`<style>` + `show()`).

Si l'orange de Stocks s'avère trop marqué à l'usage réel, on adoucit les
trois valeurs du module concerné, jamais le mécanisme lui-même.

## Formes

**Rayons généreux mais toujours rectangulaires — jamais de pilule pleine**
sur un bouton, un item de nav ou un badge (rejet explicite du style "pile"
testé puis refusé). Échelle :

| Rayon | Usage |
|---|---|
| `rounded-xl` (12px) | Petites icônes en chip, badges de compteur |
| `rounded-2xl` (16px) | Boutons, champs de formulaire, item de nav, sous-onglets |
| `20px` | Cartes et panels de contenu |
| `24px` | Tiroir (drawer), gros blocs |

Exceptions volontaires, toujours circulaires : l'avatar (convention
universelle "personne"), la jauge de progression (cercle fonctionnel, pas
décoratif).

**Ombres : jamais**, sauf pour un élément qui doit vraiment se détacher du
reste (le tiroir en bottom-sheet sur mobile, la barre de sous-onglets
flottante en bas) — et toujours très légères, jamais un `shadow-lg` ou
équivalent.

**Bordures : quasi absentes.** La séparation entre deux blocs vient d'une
différence de fond (`--panel` blanc sur `--canvas` teinté, `--alt` à
l'intérieur d'un panel blanc) plutôt que d'un contour — cohérent avec la
consigne générale "bordures discrètes ou absentes" donnée pour tout document
généré.

## Structure générale

**Jamais de maquette encadrée** : l'app occupe 100 % du viewport comme une
vraie application, jamais un cadre avec marge et fond décoratif tout autour
(erreur commise et corrigée en V2 — "ça fait maquette encadrée, pas app
réelle").

**Desktop** : sidebar blanche fixe à gauche (item actif en pilule teintée
`--accent-soft`/`--accent`) + contenu qui flotte en blanc sur le `--canvas`
du module actif.

**Mobile — Accueil devient un hub** :
- Deux widgets informatifs cliquables (ex. "Menu du jour", "Stocks en
  tension") qui doublent comme raccourcis vers leur module.
- En dessous, une rangée de tuiles "Modules" (icône + libellé) pour un accès
  direct — utile même pour un module sans widget dédié, et pensé pour
  accueillir d'autres modules à l'avenir sans redesign.
- Un module s'ouvre en plein écran (pas de sidebar sur mobile).

**Navigation mobile dans un module** :
- **Une croix persistante en haut à droite** dès qu'on est dans un module —
  ferme le module, retour au hub. Une seule instance à l'écran (bug corrigé :
  ne jamais dupliquer la croix quand un sous-écran a son propre en-tête).
- **Une flèche de retour en haut à gauche**, uniquement quand on a descendu
  un niveau à l'intérieur du module (ex. détail d'un rangement) — jamais à
  la même position que la croix, jamais les deux réunies au même endroit.
- La barre du bas (flottante, arrondie) est **réutilisée comme sous-onglets
  du module ouvert** (ex. Gestion/Catalogue pour Stocks) — absente sur le
  hub et sur un module qui n'a pas encore de sous-onglets.

**Tiroir (remplace toutes les pop-up/`confirm()` natifs)** :
- **Desktop** : une carte flottante avec marge, qui glisse depuis la droite
  et **pousse le contenu** (largeur animée `0 → 400px`) — jamais une
  superposition avec fond assombri.
- **Mobile** : un **bottom-sheet** qui remonte du bas et **passe par-dessus**
  le contenu (transform `translateY`), avec un fond assombri cliquable pour
  fermer — la place manque pour pousser le contenu sur un petit écran.
- Les deux comportements sont pilotés par une seule media query CSS sur le
  même élément (`#drawer`) — le JS ne fait qu'ajouter/retirer une classe
  `.open`, jamais de logique différente par device.

## Composants

- **Bouton principal** : fond `--accent` plein, texte blanc, `rounded-2xl`.
  Une seule action mise en avant par écran (ex. "+ Ajouter une pièce") — les
  actions secondaires restent en texte simple ou fond `--alt`, jamais un
  deuxième bouton plein sur le même écran.
- **Modale de confirmation** (remplace `confirm()` natif) : icône d'alerte
  centrée + titre + message qui précise concrètement ce qui va être
  supprimé (ex. nombre d'articles concernés) + bouton "Annuler" (neutre,
  fond `--alt`) + bouton destructif plein `--danger`.
- **Carte de liste** (ex. rangement) : icône dans un chip `rounded-xl`
  (`--accent-soft`/`--accent`), titre, deux mini-stats (nombre d'articles /
  nombre en tension — le compteur "en tension" passe en `--warn` seulement
  s'il est > 0), puis une barre de progression **seulement si un vrai ratio
  existe** derrière (quantité réelle vs cible des articles présents) —
  jamais une barre sans donnée réelle, jamais de fausse notion de "capacité"
  sur un rangement (le modèle de données Stocks n'en a pas, voir
  `CLAUDE.md`).
- **Ligne (row)** : `flex justify-between`, séparateur `--line` quasi
  invisible entre les lignes d'un même bloc — pas de carte individuelle par
  ligne.
- **Badge** : `rounded-lg`. Neutre = fond `--alt` + texte `--muted`. Mis en
  avant/compteur = fond `--accent` + texte blanc. Indicateur factuel =
  couleur sémantique (`--good`/`--warn`/`--danger`), jamais l'accent.
- **En-tête de section** : titre + sous-titre + action principale alignée à
  droite (desktop) — sur mobile, l'action principale reste visible, la
  jauge/élément secondaire peut être masquée si la place manque.
- **Jauge circulaire** : SVG compact (~48-52px), réservée à **un seul**
  indicateur clé par écran, jamais un élément qui domine la mise en page.
  Masquée sur mobile quand la place manque (ex. écran Stocks, où la barre du
  bas prend déjà de la place).

## Contenu

- Toujours du contenu réaliste et inventé dans les maquettes (ex. "Poulet
  rôti & légumes", "Placard du haut" avec 2 articles) — jamais de lorem
  ipsum, pour que la densité et la lisibilité réelles soient jugeables tout
  de suite.
- **Aucun emoji dans l'interface** — uniquement des icônes trait SVG
  (`src/lib/icons.js`, style Feather/Lucide : `viewBox 24x24`, `stroke
  currentColor`, `stroke-width 2`, coins arrondis). Repris du fait que
  family-menu n'utilise pas d'emoji comme éléments d'interface non plus
  (un seul, décoratif, dans un texte — pas un exemple à suivre).

## Historique des versions de la maquette

Toutes publiées à la même URL (republiée à chaque itération) :
1. **N&B** : structure pure en Tailwind par défaut, gris/noir, pour juger le
   wireframe indépendamment de toute décision de couleur.
2. **V1 chaleureuse** : premiers tokens couleur/typo à partir d'une
   référence Pinterest (dashboard "EmploYee") — palette bleu/lavande,
   panneau flottant encadré (rejeté ensuite).
3. **V2** : suppression du cadre, app en pleine page.
4. **V3** : marges généreuses, tiroir repositionné en carte flottante,
   stats + barre de progression sur les cartes de rangement.
5. **V4** : déclinaison mobile (barre du bas, tiroir en bottom-sheet, grille
   à 1 colonne).
6. **V5** : Accueil devient un hub avec tuiles, modules en plein écran avec
   retour.
7. **V6 (actuelle)** : couleur par module (`data-module`), navigation
   croix/flèche corrigée (une seule croix, flèche à gauche).
