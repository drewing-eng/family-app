import { pb } from './pocketbase.js';

// Un "planning" = un import JSON complet (meta + days + courses, voir
// CLAUDE.md § Modèle de données — module Menus). Pas de champ "actuel" en
// base : le planning courant est simplement le plus récent par `created`
// (champ système PocketBase) — mêmes mécanisme et convention que
// l'archivage par horodatage de family-menu, juste porté sur PocketBase.

export function listPlannings() {
  return pb.collection('menu_plannings').getFullList({ sort: '-created' });
}

export async function getCurrentPlanning() {
  return pb.collection('menu_plannings').getFirstListItem('', { sort: '-created' }).catch(() => null);
}

// Valide la forme minimale attendue (schéma v2) avant d'envoyer à
// PocketBase — évite un import silencieusement inutilisable par les écrans
// Jours/Courses/Production. Le reste de la structure n'est pas revalidé en
// détail côté client : le format fait foi (voir spec fournie par
// l'utilisateur), pas une revalidation exhaustive ici.
export function importPlanning(data) {
  if (!data || typeof data !== 'object') throw new Error('Fichier JSON invalide.');
  if (data.meta?.schemaVersion !== 2) throw new Error('Format non reconnu (schemaVersion doit valoir 2).');
  if (!Array.isArray(data.days)) throw new Error('Le champ "days" est manquant ou invalide.');
  if (!Array.isArray(data.courses)) throw new Error('Le champ "courses" est manquant ou invalide.');
  return pb.collection('menu_plannings').create({ data, label: data.meta.title || data.meta.period || '' });
}

// ── Cases cochées de la liste de courses (synchronisées entre tous les
// membres — voir CLAUDE.md). `item_key` = l'`id` déjà unique fourni par
// chaque ligne de courses[].items[] dans le JSON, pas de dérivation à faire. ──

export function listCheckedForPlanning(planningId) {
  return pb.collection('menu_courses_checked').getFullList({ filter: `planning = "${planningId}"` });
}

export async function setChecked(planningId, itemKey, checked) {
  const existing = await pb.collection('menu_courses_checked')
    .getFirstListItem(`planning = "${planningId}" && item_key = "${itemKey}"`, { requestKey: null })
    .catch(() => null);
  if (existing) return pb.collection('menu_courses_checked').update(existing.id, { checked });
  return pb.collection('menu_courses_checked').create({ planning: planningId, item_key: itemKey, checked });
}

// Souscription temps réel (PocketBase Realtime) pour la synchronisation
// entre membres de la famille — callback(record, action) appelé à chaque
// création/mise à jour touchant ce planning. Le filtrage par planning se
// fait côté client (le SDK ne filtre pas les topics `*` par requête) : le
// volume par planning reste trivial (quelques dizaines de lignes).
export function subscribeChecked(planningId, callback) {
  return pb.collection('menu_courses_checked').subscribe('*', (e) => {
    if (e.record.planning === planningId) callback(e.record, e.action);
  });
}

export function unsubscribeChecked() {
  return pb.collection('menu_courses_checked').unsubscribe('*');
}

// Le JSON fourni embarque parfois des emoji (icônes de rayon, préfixes de
// titres de section) — l'app n'affiche jamais d'emoji (décision produit,
// voir CLAUDE.md § Design system) : on les retire à l'affichage plutôt que
// de toucher aux données importées, qui restent fidèles à la source.
export function stripEmoji(str) {
  return String(str ?? '').replace(/[\p{Extended_Pictographic}‍️]/gu, '').trim();
}
