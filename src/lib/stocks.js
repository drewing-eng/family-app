import { pb } from './pocketbase.js';

export function tensionRatio(qty, max) {
  if (!max || max <= 0) return 1;
  return qty / max;
}

export function isTension(qty, max) {
  return max > 0 && tensionRatio(qty, max) < 0.2;
}

// ── Catalogue ──
export function listCatalogue() {
  return pb.collection('catalogue').getFullList({ sort: 'nom' });
}
export function createCatalogueItem(data) {
  return pb.collection('catalogue').create(data);
}
export function updateCatalogueItem(id, data) {
  return pb.collection('catalogue').update(id, data);
}
export function deleteCatalogueItem(id) {
  return pb.collection('catalogue').delete(id);
}

// ── Coffres & emplacements ──
export function listCoffres() {
  return pb.collection('coffres').getFullList({ sort: 'nom' });
}

export function listEmplacements(coffreId) {
  return pb.collection('emplacements').getFullList({
    filter: `coffre = "${coffreId}"`,
    sort: 'index',
    expand: 'article',
  });
}

export async function createCoffre({ nom, nb_emplacements }) {
  const coffre = await pb.collection('coffres').create({ nom, nb_emplacements });
  for (let i = 1; i <= nb_emplacements; i++) {
    await pb.collection('emplacements').create({ coffre: coffre.id, index: i, quantite: 0 });
  }
  return coffre;
}

export function deleteCoffre(id) {
  return pb.collection('coffres').delete(id); // cascade supprime ses emplacements
}

// ── Mouvement de stock : fixe la nouvelle quantité d'un emplacement (et
// l'article s'il change), puis trace le delta dans l'historique. Deux appels
// séquentiels (pas de transaction multi-collection côté client PocketBase) —
// acceptable pour une app perso, à surveiller si ça pose problème un jour.
export async function updateEmplacement({ emplacement, coffreNom, articleId, articleNom, previousQuantite, newQuantite }) {
  await pb.collection('emplacements').update(emplacement, { article: articleId || null, quantite: newQuantite });

  const delta = newQuantite - previousQuantite;
  if (delta === 0) return;
  await pb.collection('historique').create({
    emplacement,
    coffre_nom: coffreNom,
    article_nom: articleNom || '(article retiré)',
    type: delta > 0 ? 'ajout' : 'retrait',
    quantite: Math.abs(delta),
  });
}

// ── Historique ──
export async function listHistorique(limit = 50) {
  const res = await pb.collection('historique').getList(1, limit, { sort: '-created' });
  return res.items;
}
