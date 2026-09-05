import { userRole } from '../lib/pocketbase.js';
import {
  listCatalogue, createCatalogueItem, updateCatalogueItem, deleteCatalogueItem,
  listPieces, createPiece, deletePiece,
  listRangements, createRangement, deleteRangement,
  listStocks, upsertStock, deleteStock,
  totalsByArticle, isTension,
} from '../lib/stocks.js';
import { pb } from '../lib/pocketbase.js';
import { icon } from '../lib/icons.js';
import { openDrawer, confirmDrawer } from '../lib/drawer.js';

// Pas d'unité structurée en base à l'origine (décision produit initiale) ;
// `catalogue.unite` (texte libre, optionnel — à créer côté PocketBase par le
// superadmin, voir CLAUDE.md) permet depuis de fixer une unité par article,
// affichée partout où sa quantité apparaît. Ce rappel reste affiché comme
// repli tant qu'un article n'a pas d'unité renseignée.
const UNIT_HINT = "Unité libre : g, kg, ml, L, pièces… Renseigne-la sur l'article dans le catalogue pour qu'elle s'affiche partout, sinon reste au moins cohérent d'une saisie à l'autre.";

// Rangement actuellement ouvert en vue détail (liste → détail, comme
// Chest_gestion) ; persiste tant qu'on reste sur l'onglet Stocks, réinitialisé
// seulement via le bouton Retour ou si le rangement n'existe plus.
let currentDetailRangement = null;

// Recherche/filtre/tri de l'écran Gestion — Liste : persiste tant qu'on reste
// sur l'onglet Stocks, comme currentDetailRangement ci-dessus.
let listFilters = { search: '', piece: '', sortTension: false };

export async function renderStocksTab(container, tab, user, opts = {}) {
  const canWrite = ['admin', 'membre'].includes(userRole(user));
  const refresh = () => renderStocksTab(container, tab, user, opts);

  container.innerHTML = '<div class="empty-state small"><p>Chargement…</p></div>';
  try {
    // Catalogue + stocks servent à la fois à l'écran actif et au résumé de
    // tension affiché par shell.js (jauge desktop) : chargés systématiquement
    // pour éviter un aller-retour PocketBase supplémentaire côté coquille.
    const [catalogue, stocks] = await Promise.all([listCatalogue(), listStocks()]);
    const totals = totalsByArticle(stocks);

    if (opts.onSummary) {
      const tense = catalogue.filter((a) => isTension(totals.get(a.id) || 0, a.quantite_cible)).length;
      opts.onSummary({ tense, total: catalogue.length });
    }

    if (tab === 'catalogue') {
      renderCatalogue(container, canWrite, refresh, catalogue);
    } else {
      const [pieces, rangements] = await Promise.all([listPieces(), listRangements()]);
      renderGestion(container, canWrite, refresh, { catalogue, totals, stocks, pieces, rangements });
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="ic">${icon('alert-triangle')}</div><p><strong>Erreur de chargement</strong></p><p class="small">${escapeHtml(err.message || 'Réessaie dans un instant.')}</p></div>`;
  }
}

/* ── Gestion : liste (Pièce → Rangements) → détail (articles d'un rangement) ── */
function renderGestion(container, canWrite, refresh, { catalogue, totals, stocks, pieces, rangements }) {
  const detail = currentDetailRangement && rangements.find((r) => r.id === currentDetailRangement);
  if (currentDetailRangement && !detail) currentDetailRangement = null;

  if (detail) {
    renderGestionDetail(container, canWrite, refresh, { detail, pieces, catalogue, stocks });
  } else {
    renderGestionList(container, canWrite, refresh, { catalogue, totals, pieces, rangements, stocks });
  }
}

function renderGestionList(container, canWrite, refresh, { catalogue, totals, pieces, rangements, stocks }) {
  const catalogueById = new Map(catalogue.map((a) => [a.id, a]));

  function paint() {
    const active = document.activeElement;
    const wasSearchFocused = active && active.id === 'stocksSearch';
    const caret = wasSearchFocused ? active.selectionStart : null;

    let html = '';

    // Tension globale : somme d'un article dans toute la maison vs sa cible catalogue.
    const tenseItems = catalogue.filter((a) => isTension(totals.get(a.id) || 0, a.quantite_cible));
    if (tenseItems.length) {
      html += `<div class="panel"><div class="panel-head"><span class="panel-head-title">Articles en tension</span><span class="badge accent">${tenseItems.length}</span></div><div class="panel-body" style="padding-top:8px;">`;
      tenseItems.forEach((a) => {
        const total = totals.get(a.id) || 0;
        const pct = Math.max(0, Math.min(100, (total / a.quantite_cible) * 100));
        const unite = a.unite ? ` ${escapeHtml(a.unite)}` : '';
        html += `<div class="row tension-row">
          <span class="row-text">${escapeHtml(a.nom)}</span>
          <div class="tension-bar"><div class="tension-bar-fill" style="width:${pct}%"></div></div>
          <span class="tension-count">${total} / ${a.quantite_cible}${unite}</span>
        </div>`;
      });
      html += '</div></div>';
    }

    html += `<p class="unit-hint">${UNIT_HINT}</p>`;

    html += `<div class="stocks-toolbar">
      <div class="stocks-search">
        ${icon('search')}
        <input type="search" id="stocksSearch" placeholder="Rechercher un rangement, un article…" value="${escapeHtml(listFilters.search)}" />
      </div>
      <select id="stocksPieceFilter" class="stocks-piece-filter" aria-label="Filtrer par pièce">
        <option value="">Toutes les pièces</option>
        ${pieces.map((p) => `<option value="${p.id}"${listFilters.piece === p.id ? ' selected' : ''}>${escapeHtml(p.nom)}</option>`).join('')}
      </select>
      <button type="button" class="stocks-sort-toggle${listFilters.sortTension ? ' active' : ''}" id="stocksSortToggle" aria-pressed="${listFilters.sortTension}" title="Trier : rangements en tension d'abord">${icon('sort')}</button>
    </div>`;

    html += `<div class="section-head">
      <div>
        <div class="section-head-title">Vos pièces</div>
        <div class="section-head-sub">Vue d'ensemble par pièce et rangement</div>
      </div>
      ${canWrite ? `<div class="section-head-actions"><button class="btn-primary small" data-action="add-piece">+ Ajouter une pièce</button></div>` : ''}
    </div>`;

    if (!pieces.length) {
      html += emptyState('door', 'Aucune pièce', canWrite ? 'Ajoute ta première pièce (Cuisine, Salle de bain…) pour commencer.' : 'Aucune pièce créée pour l’instant.');
    } else {
      const term = listFilters.search.trim().toLowerCase();
      let anyRendered = false;

      pieces.forEach((piece) => {
        if (listFilters.piece && piece.id !== listFilters.piece) return;

        let entries = rangements
          .filter((r) => r.piece === piece.id)
          .map((rangement) => {
            const lignes = stocks.filter((s) => s.rangement === rangement.id);
            let tensionCount = 0;
            let sumQty = 0;
            let sumCible = 0;
            lignes.forEach((l) => {
              const art = catalogueById.get(l.article);
              if (!art) return;
              if (isTension(totals.get(art.id) || 0, art.quantite_cible)) tensionCount++;
              sumQty += l.quantite;
              sumCible += art.quantite_cible;
            });
            const pct = sumCible > 0 ? Math.min(100, Math.round((sumQty / sumCible) * 100)) : 0;
            return { rangement, lignes, tensionCount, pct };
          });

        if (term) {
          entries = entries.filter(
            ({ rangement, lignes }) =>
              rangement.nom.toLowerCase().includes(term) ||
              lignes.some((l) => catalogueById.get(l.article)?.nom.toLowerCase().includes(term))
          );
        }
        if (listFilters.sortTension) entries = [...entries].sort((a, b) => b.tensionCount - a.tensionCount);

        if (!entries.length) {
          if (term) return; // filtre actif sans résultat : on masque la pièce plutôt que de l'afficher vide
          html += `<div class="piece-block">
            <div class="piece-head">
              <span class="piece-head-title">${escapeHtml(piece.nom)}</span>
              ${
                canWrite
                  ? `<span class="piece-head-actions"><button class="link-accent" data-action="add-rangement" data-piece="${piece.id}" data-piece-nom="${escapeHtml(piece.nom)}">+ Rangement</button><button class="link-muted" data-action="delete-piece" data-id="${piece.id}" data-nom="${escapeHtml(piece.nom)}">Supprimer</button></span>`
                  : ''
              }
            </div>
            <p class="row-note piece-empty">Aucun rangement dans cette pièce.</p>
          </div>`;
          anyRendered = true;
          return;
        }

        anyRendered = true;
        html += `<div class="piece-block">
          <div class="piece-head">
            <span class="piece-head-title">${escapeHtml(piece.nom)}</span>
            ${
              canWrite
                ? `<span class="piece-head-actions"><button class="link-accent" data-action="add-rangement" data-piece="${piece.id}" data-piece-nom="${escapeHtml(piece.nom)}">+ Rangement</button><button class="link-muted" data-action="delete-piece" data-id="${piece.id}" data-nom="${escapeHtml(piece.nom)}">Supprimer</button></span>`
                : ''
            }
          </div>
          <div class="rangecard-grid">`;
        entries.forEach(({ rangement, lignes, tensionCount, pct }) => {
          html += `<button class="rangecard" data-action="open-rangement" data-id="${rangement.id}">
            <span class="rangecard-ic">${icon('box')}</span>
            <span class="rangecard-title">${escapeHtml(rangement.nom)}</span>
            <span class="rangecard-stats">
              <span class="rangecard-stat"><span class="rangecard-stat-n">${lignes.length}</span><span class="rangecard-stat-lbl">Article${lignes.length > 1 ? 's' : ''}</span></span>
              <span class="rangecard-stat"><span class="rangecard-stat-n${tensionCount > 0 ? ' warn' : ''}">${tensionCount}</span><span class="rangecard-stat-lbl">En tension</span></span>
            </span>
            ${
              lignes.length
                ? `<span class="rangecard-bar">
              <span class="rangecard-bar-head"><span>Rempli</span><span>${pct}%</span></span>
              <span class="rangecard-bar-track"><span class="rangecard-bar-fill" style="width:${pct}%"></span></span>
            </span>`
                : ''
            }
          </button>`;
        });
        html += '</div></div>';
      });

      if (!anyRendered) {
        html += emptyState('search', 'Aucun résultat', term ? `Aucun rangement ou article ne correspond à « ${listFilters.search.trim()} ».` : 'Aucun rangement dans cette pièce.');
      }
    }

    container.innerHTML = html;
    wireEvents();

    if (wasSearchFocused) {
      const el = container.querySelector('#stocksSearch');
      if (el) { el.focus(); el.setSelectionRange(caret, caret); }
    }
  }

  function wireEvents() {
    const searchInput = container.querySelector('#stocksSearch');
    if (searchInput) {
      searchInput.oninput = () => { listFilters.search = searchInput.value; paint(); };
    }
    const pieceSelect = container.querySelector('#stocksPieceFilter');
    if (pieceSelect) {
      pieceSelect.onchange = () => { listFilters.piece = pieceSelect.value; paint(); };
    }

    container.onclick = async (e) => {
      if (e.target.closest('#stocksSortToggle')) {
        listFilters.sortTension = !listFilters.sortTension;
        paint();
        return;
      }
      if (e.target.closest('[data-action="add-piece"]')) {
        dialogAddPiece(refresh);
        return;
      }
      const openR = e.target.closest('[data-action="open-rangement"]');
      if (openR) {
        currentDetailRangement = openR.dataset.id;
        refresh();
        return;
      }
      const delPiece = e.target.closest('[data-action="delete-piece"]');
      if (delPiece) {
        const ok = await confirmDrawer(
          `Supprimer « ${delPiece.dataset.nom} » ?`,
          'Cette pièce et tous ses rangements (avec leur contenu) seront supprimés.'
        );
        if (ok) deletePiece(delPiece.dataset.id).then(refresh).catch((err) => alert(err.message));
        return;
      }
      const addRangement = e.target.closest('[data-action="add-rangement"]');
      if (addRangement) {
        dialogAddRangement({ pieceId: addRangement.dataset.piece, pieceNom: addRangement.dataset.pieceNom }, refresh);
      }
    };
  }

  paint();
}

function renderGestionDetail(container, canWrite, refresh, { detail, pieces, catalogue, stocks }) {
  const piece = pieces.find((p) => p.id === detail.piece);
  const lignes = stocks.filter((s) => s.rangement === detail.id);
  const already = new Set(lignes.map((s) => s.article));
  const availableCatalogue = catalogue.filter((a) => !already.has(a.id));

  let html = `<button class="detail-back" data-action="back-to-list">${icon('arrow-left')} Retour</button>
  <div class="section-head">
    <div>
      <div class="section-head-title">${escapeHtml(detail.nom)}</div>
      <div class="section-head-sub">${piece ? escapeHtml(piece.nom) : ''}</div>
    </div>
    ${
      canWrite
        ? `<div class="section-head-actions"><button class="link-accent" data-action="add-stock">+ Article</button><button class="icon-btn" data-action="delete-rangement" title="Supprimer">${icon('trash')}</button></div>`
        : ''
    }
  </div>
  <div class="panel"><div class="panel-body" style="padding-top:8px;">`;

  if (!lignes.length) {
    html += `<p class="row-note">Vide.</p>`;
  }
  lignes.forEach((ligne) => {
    const article = ligne.expand?.article;
    const cible = article?.quantite_cible;
    const pct = cible > 0 ? Math.max(0, Math.min(100, (ligne.quantite / cible) * 100)) : 0;
    const unite = article?.unite ? ` ${escapeHtml(article.unite)}` : '';
    html += `<div class="row detail-row">
      <div class="row-label"><div class="row-text">${article ? escapeHtml(article.nom) : '(article supprimé)'}</div><div class="row-note">${ligne.quantite}${cible ? ` / ${cible}` : ''}${unite}</div></div>
      <div class="detail-row-bar"><div class="detail-row-bar-fill" style="width:${pct}%"></div></div>
      ${
        canWrite
          ? `<span class="panel-head-actions"><button class="link-accent" data-action="edit-stock" data-id="${ligne.id}" data-nom="${article ? escapeHtml(article.nom) : ''}" data-qty="${ligne.quantite}" data-unite="${article?.unite ? escapeHtml(article.unite) : ''}">Ajuster</button><button class="link-muted" data-action="delete-stock" data-id="${ligne.id}" data-nom="${article ? escapeHtml(article.nom) : ''}">Retirer</button></span>`
          : ''
      }
    </div>`;
  });
  html += '</div></div>';

  container.innerHTML = html;
  container.onclick = async (e) => {
    if (e.target.closest('[data-action="back-to-list"]')) {
      currentDetailRangement = null;
      refresh();
      return;
    }
    if (e.target.closest('[data-action="add-stock"]')) {
      dialogAddStock({ rangementId: detail.id, rangementNom: detail.nom, catalogue: availableCatalogue }, refresh);
      return;
    }
    if (e.target.closest('[data-action="delete-rangement"]')) {
      const ok = await confirmDrawer(
        `Supprimer « ${detail.nom} » ?`,
        lignes.length
          ? `Ce rangement et son contenu (${lignes.length} article${lignes.length > 1 ? 's' : ''}) seront supprimés.`
          : 'Ce rangement est vide.'
      );
      if (ok) {
        deleteRangement(detail.id)
          .then(() => { currentDetailRangement = null; refresh(); })
          .catch((err) => alert(err.message));
      }
      return;
    }
    const editStock = e.target.closest('[data-action="edit-stock"]');
    if (editStock) {
      dialogEditStock({ id: editStock.dataset.id, nom: editStock.dataset.nom, qty: Number(editStock.dataset.qty), unite: editStock.dataset.unite }, refresh);
      return;
    }
    const delStock = e.target.closest('[data-action="delete-stock"]');
    if (delStock) {
      const ok = await confirmDrawer(`Retirer « ${delStock.dataset.nom} » ?`, 'Cette ligne sera retirée du rangement.');
      if (ok) deleteStock(delStock.dataset.id).then(refresh).catch((err) => alert(err.message));
    }
  };
}

function dialogAddPiece(onDone) {
  openDrawer('Ajouter une pièce', `
    <label class="field"><span>Nom</span><input type="text" name="nom" required autofocus placeholder="Cuisine, Salle de bain, Garage…" /></label>
  `, {
    onSubmit: async (fd) => {
      const nom = fd.get('nom').trim();
      if (!nom) throw new Error('Le nom est requis.');
      await createPiece(nom);
      onDone();
    },
  });
}

function dialogAddRangement({ pieceId, pieceNom }, onDone) {
  openDrawer(`Ajouter un rangement · ${pieceNom}`, `
    <label class="field"><span>Nom</span><input type="text" name="nom" required autofocus placeholder="Frigo, Placard du haut, Étagère…" /></label>
  `, {
    onSubmit: async (fd) => {
      const nom = fd.get('nom').trim();
      if (!nom) throw new Error('Le nom est requis.');
      await createRangement({ nom, piece: pieceId });
      onDone();
    },
  });
}

function dialogAddStock({ rangementId, rangementNom, catalogue }, onDone) {
  if (!catalogue.length) {
    alert('Tous les articles du catalogue sont déjà dans ce rangement (ou le catalogue est vide).');
    return;
  }
  const options = catalogue.map((a) => `<option value="${a.id}" data-unite="${a.unite ? escapeHtml(a.unite) : ''}">${escapeHtml(a.nom)}</option>`).join('');
  openDrawer(`Ajouter un article · ${rangementNom}`, `
    <label class="field"><span>Article</span><select name="article" id="stockArticleSelect" required>${options}</select></label>
    <label class="field"><span>Quantité</span><input type="number" name="quantite" min="0" step="any" required value="1" /></label>
    <p class="field-hint" id="stockUnitHint"></p>
  `, {
    onSubmit: async (fd) => {
      const article = fd.get('article');
      const quantite = Number(fd.get('quantite'));
      await upsertStock({ rangement: rangementId, article, quantite });
      onDone();
    },
  });

  // Câblé après coup plutôt qu'un onSubmit unique : le tiroir remplit son
  // DOM de façon synchrone (voir drawer.js), donc ces éléments existent déjà.
  const select = document.getElementById('stockArticleSelect');
  const hint = document.getElementById('stockUnitHint');
  const syncHint = () => {
    const unite = select.selectedOptions[0]?.dataset.unite;
    hint.textContent = unite ? `Unité : ${unite}` : UNIT_HINT;
  };
  select.addEventListener('change', syncHint);
  syncHint();
}

function dialogEditStock({ id, nom, qty, unite }, onDone) {
  openDrawer(`Ajuster · ${nom}`, `
    <label class="field"><span>Quantité</span><input type="number" name="quantite" min="0" step="any" required value="${qty}" autofocus /></label>
    <p class="field-hint">${unite ? `Unité : ${escapeHtml(unite)}` : UNIT_HINT}</p>
  `, {
    onSubmit: async (fd) => {
      const quantite = Number(fd.get('quantite'));
      await pb.collection('stocks').update(id, { quantite });
      onDone();
    },
  });
}

/* ── Catalogue ── */
function renderCatalogue(container, canWrite, refresh, items) {
  let html = `<div class="section-head">
    <div>
      <div class="section-head-title">Catalogue</div>
      <div class="section-head-sub">Les articles connus et leur quantité cible pour toute la maison</div>
    </div>
    ${canWrite ? `<div class="section-head-actions"><button class="btn-primary small" data-action="add-article">+ Ajouter un article</button></div>` : ''}
  </div>`;
  html += `<p class="unit-hint">${UNIT_HINT}</p>`;

  if (!items.length) {
    html += emptyState('book', 'Catalogue vide', canWrite ? 'Ajoute le premier article du catalogue.' : 'Aucun article pour l’instant.');
  } else {
    html += '<div class="panel"><div class="panel-body" style="padding-top:8px;">';
    items.forEach((item) => {
      const unite = item.unite ? ` ${escapeHtml(item.unite)}` : '';
      html += `<div class="row">
        <span class="row-text">${escapeHtml(item.nom)}</span>
        <span class="panel-head-actions">
          <span class="row-note">cible : ${item.quantite_cible}${unite}</span>
          ${
            canWrite
              ? `<button class="link-accent" data-action="edit-article" data-id="${item.id}" data-nom="${escapeHtml(item.nom)}" data-cible="${item.quantite_cible}" data-unite="${item.unite ? escapeHtml(item.unite) : ''}">Modifier</button><button class="link-muted" data-action="delete-article" data-id="${item.id}" data-nom="${escapeHtml(item.nom)}">Supprimer</button>`
              : ''
          }
        </span>
      </div>`;
    });
    html += '</div></div>';
  }

  container.innerHTML = html;
  container.onclick = async (e) => {
    if (e.target.closest('[data-action="add-article"]')) {
      dialogArticle(null, refresh);
      return;
    }
    const editBtn = e.target.closest('[data-action="edit-article"]');
    if (editBtn) {
      dialogArticle({ id: editBtn.dataset.id, nom: editBtn.dataset.nom, cible: editBtn.dataset.cible, unite: editBtn.dataset.unite }, refresh);
      return;
    }
    const delBtn = e.target.closest('[data-action="delete-article"]');
    if (delBtn) {
      const nom = delBtn.dataset.nom;
      const ok = await confirmDrawer(`Supprimer « ${nom} » du catalogue ?`, 'Il sera aussi retiré de tous les rangements où il apparaît.');
      if (ok) deleteCatalogueItem(delBtn.dataset.id).then(refresh).catch((err) => alert(err.message));
    }
  };
}

function dialogArticle(existing, onDone) {
  openDrawer(existing ? "Modifier l'article" : 'Ajouter un article', `
    <label class="field"><span>Nom</span><input type="text" name="nom" required autofocus value="${existing ? escapeHtml(existing.nom) : ''}" /></label>
    <label class="field"><span>Quantité cible (stock plein, toute la maison)</span><input type="number" name="quantite_cible" min="1" step="any" required value="${existing ? existing.cible : 1}" /></label>
    <label class="field"><span>Unité</span><input type="text" name="unite" placeholder="g, kg, ml, L, pièces…" value="${existing ? escapeHtml(existing.unite || '') : ''}" /></label>
  `, {
    onSubmit: async (fd) => {
      const nom = fd.get('nom').trim();
      const quantite_cible = Number(fd.get('quantite_cible'));
      const unite = fd.get('unite').trim();
      if (!nom) throw new Error('Le nom est requis.');
      const data = { nom, quantite_cible, unite };
      if (existing) await updateCatalogueItem(existing.id, data);
      else await createCatalogueItem(data);
      onDone();
    },
  });
}

function emptyState(iconName, title, text) {
  return `<div class="empty-state"><div class="ic">${icon(iconName)}</div><p><strong>${escapeHtml(title)}</strong></p><p class="small">${escapeHtml(text)}</p></div>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
