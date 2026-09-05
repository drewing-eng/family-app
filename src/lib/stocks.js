import { pb } from './pocketbase.js';

// `quantite`/`quantite_cible` restent de simples nombres (pas de type "unité"
// structuré) ; `catalogue.unite` (texte libre, optionnel) porte l'unité
// affichée à côté de ces nombres — voir CLAUDE.md § Modèle de données.

export function isTension(total, cible) {
  return cible > 0 && total / cible < 0.2;
}

// ── Catalogue (article + quantité cible, utilisée pour le calcul global de tension) ──
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

// ── Pièces ──
export function listPieces() {
  return pb.collection('pieces').getFullList({ sort: 'nom' });
}
export function createPiece(nom) {
  return pb.collection('pieces').create({ nom });
}
export function deletePiece(id) {
  return pb.collection('pieces').delete(id); // cascade supprime ses rangements (et leurs stocks)
}

// ── Rangements (toujours rattachés à une pièce) ──
export function listRangements() {
  return pb.collection('rangements').getFullList({ sort: 'nom', expand: 'piece' });
}
export function createRangement({ nom, piece }) {
  return pb.collection('rangements').create({ nom, piece });
}
export function deleteRangement(id) {
  return pb.collection('rangements').delete(id); // cascade supprime ses lignes de stock
}

// ── Stocks : une ligne = (rangement, article, quantité). Pas d'index, pas de
// slot vide — on n'a une ligne que si l'article est réellement présent. ──
export function listStocks() {
  return pb.collection('stocks').getFullList({ sort: '-created', expand: 'article,rangement' });
}

// Ajoute une ligne, ou fusionne dans la ligne existante si cet article est
// déjà présent dans ce rangement (pas de doublon rangement+article).
export async function upsertStock({ rangement, article, quantite }) {
  const existing = await pb.collection('stocks').getFirstListItem(
    `rangement = "${rangement}" && article = "${article}"`,
    { requestKey: null }
  ).catch(() => null);
  if (existing) return pb.collection('stocks').update(existing.id, { quantite });
  return pb.collection('stocks').create({ rangement, article, quantite });
}

export function deleteStock(id) {
  return pb.collection('stocks').delete(id);
}

// Total d'un article, tous rangements confondus (pour la tension globale).
export function totalsByArticle(stocks) {
  const totals = new Map();
  stocks.forEach((s) => {
    totals.set(s.article, (totals.get(s.article) || 0) + s.quantite);
  });
  return totals;
}

// Articles en tension, du plus critique (ratio le plus bas) au moins
// critique — utilisé par le widget Wall "Stocks en tension" (voir
// shell.js), pourra resservir ailleurs (notifications, etc.).
export async function tensionItems() {
  const [catalogue, stocks] = await Promise.all([listCatalogue(), listStocks()]);
  const totals = totalsByArticle(stocks);
  return catalogue
    .map((a) => ({ ...a, total: totals.get(a.id) || 0 }))
    .filter((a) => isTension(a.total, a.quantite_cible))
    .sort((a, b) => a.total / a.quantite_cible - b.total / b.quantite_cible);
}
