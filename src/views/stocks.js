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

// Pas d'unité structurée en base (décision produit) : juste un rappel dans
// l'interface, à la saisie comme à l'affichage, pour que les nombres restent
// compréhensibles sans avoir à définir une unité par article.
const UNIT_HINT = 'Unité libre : g, kg, ml, L, pièces… reste cohérent pour un même article.';

// Rangement actuellement ouvert en vue détail (liste → détail, comme
// Chest_gestion) ; persiste tant qu'on reste sur l'onglet Stocks, réinitialisé
// seulement via le bouton Retour ou si le rangement n'existe plus.
let currentDetailRangement = null;

export async function renderStocksTab(container, tab, user) {
  const canWrite = ['admin', 'membre'].includes(userRole(user));
  const refresh = () => renderStocksTab(container, tab, user);

  container.innerHTML = '<div class="empty-state small"><p>Chargement…</p></div>';
  try {
    if (tab === 'catalogue') await renderCatalogue(container, canWrite, refresh);
    else await renderGestion(container, canWrite, refresh);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="ic">${icon('alert-triangle')}</div><p><strong>Erreur de chargement</strong></p><p class="small">${escapeHtml(err.message || 'Réessaie dans un instant.')}</p></div>`;
  }
}

/* ── Gestion : liste (Pièce → Rangements) → détail (articles d'un rangement) ── */
async function renderGestion(container, canWrite, refresh) {
  const [catalogue, pieces, rangements, stocks] = await Promise.all([
    listCatalogue(), listPieces(), listRangements(), listStocks(),
  ]);

  const detail = currentDetailRangement && rangements.find((r) => r.id === currentDetailRangement);
  if (currentDetailRangement && !detail) currentDetailRangement = null;

  if (detail) {
    renderGestionDetail(container, canWrite, refresh, { detail, pieces, catalogue, stocks });
  } else {
    renderGestionList(container, canWrite, refresh, { catalogue, pieces, rangements, stocks });
  }
}

function renderGestionList(container, canWrite, refresh, { catalogue, pieces, rangements, stocks }) {
  const totals = totalsByArticle(stocks);
  let html = '';

  // Tension globale : somme d'un article dans toute la maison vs sa cible catalogue.
  const tenseItems = catalogue.filter((a) => isTension(totals.get(a.id) || 0, a.quantite_cible));
  if (tenseItems.length) {
    html += `<div class="panel"><div class="panel-head"><span class="panel-head-title">Articles en tension</span><span class="badge red">${tenseItems.length}</span></div><div class="panel-body" style="padding-top:8px;">`;
    tenseItems.forEach((a) => {
      html += `<div class="row"><span class="row-text">${escapeHtml(a.nom)}</span><span class="gluco eleve"><span class="gluco-dot"></span>${totals.get(a.id) || 0} / ${a.quantite_cible}</span></div>`;
    });
    html += '</div></div>';
  }

  html += `<p class="unit-hint">${UNIT_HINT}</p>`;

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
    pieces.forEach((piece) => {
      const piecesRangements = rangements.filter((r) => r.piece === piece.id);
      html += `<div class="panel">
        <div class="panel-head">
          <span class="panel-head-title">${escapeHtml(piece.nom)}</span>
          ${
            canWrite
              ? `<span class="panel-head-actions"><button class="btn-ghost small" data-action="add-rangement" data-piece="${piece.id}" data-piece-nom="${escapeHtml(piece.nom)}">+ Rangement</button><button class="link-danger" data-action="delete-piece" data-id="${piece.id}" data-nom="${escapeHtml(piece.nom)}">Supprimer</button></span>`
              : ''
          }
        </div>
        <div class="panel-body" style="padding-top:4px;">`;

      if (!piecesRangements.length) {
        html += `<p class="row-note" style="padding:6px 0;">Aucun rangement dans cette pièce.</p>`;
      } else {
        html += '<div class="rangement-list">';
        piecesRangements.forEach((rangement) => {
          const count = stocks.filter((s) => s.rangement === rangement.id).length;
          html += `<button class="row rangement-row" data-action="open-rangement" data-id="${rangement.id}">
            <span><span class="row-text">${escapeHtml(rangement.nom)}</span><span class="row-note">${count ? `${count} article${count > 1 ? 's' : ''}` : 'Vide'}</span></span>
            <span class="chevron-ic">${icon('chevron-right')}</span>
          </button>`;
        });
        html += '</div>';
      }
      html += '</div></div>';
    });
  }

  container.innerHTML = html;
  container.onclick = async (e) => {
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
      const ok = await confirmModal(
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
        ? `<div class="section-head-actions"><button class="btn-ghost small" data-action="add-stock">+ Article</button><button class="icon-btn" data-action="delete-rangement" title="Supprimer">${icon('trash')}</button></div>`
        : ''
    }
  </div>
  <div class="panel"><div class="panel-body" style="padding-top:8px;">`;

  if (!lignes.length) {
    html += `<p class="row-note">Vide.</p>`;
  }
  lignes.forEach((ligne) => {
    const article = ligne.expand?.article;
    html += `<div class="row">
      <div><div class="row-text">${article ? escapeHtml(article.nom) : '(article supprimé)'}</div><div class="row-note">${ligne.quantite}</div></div>
      ${
        canWrite
          ? `<span class="panel-head-actions"><button class="btn-ghost small" data-action="edit-stock" data-id="${ligne.id}" data-nom="${article ? escapeHtml(article.nom) : ''}" data-qty="${ligne.quantite}">Ajuster</button><button class="link-danger" data-action="delete-stock" data-id="${ligne.id}" data-nom="${article ? escapeHtml(article.nom) : ''}">Retirer</button></span>`
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
      const ok = await confirmModal(
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
      dialogEditStock({ id: editStock.dataset.id, nom: editStock.dataset.nom, qty: Number(editStock.dataset.qty) }, refresh);
      return;
    }
    const delStock = e.target.closest('[data-action="delete-stock"]');
    if (delStock) {
      const ok = await confirmModal(`Retirer « ${delStock.dataset.nom} » ?`, 'Cette ligne sera retirée du rangement.');
      if (ok) deleteStock(delStock.dataset.id).then(refresh).catch((err) => alert(err.message));
    }
  };
}

function dialogAddPiece(onDone) {
  openDialog('Ajouter une pièce', `
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
  openDialog(`Ajouter un rangement · ${pieceNom}`, `
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
  const options = catalogue.map((a) => `<option value="${a.id}">${escapeHtml(a.nom)}</option>`).join('');
  openDialog(`Ajouter un article · ${rangementNom}`, `
    <label class="field"><span>Article</span><select name="article" required>${options}</select></label>
    <label class="field"><span>Quantité</span><input type="number" name="quantite" min="0" step="any" required value="1" /></label>
    <p class="field-hint">${UNIT_HINT}</p>
  `, {
    onSubmit: async (fd) => {
      const article = fd.get('article');
      const quantite = Number(fd.get('quantite'));
      await upsertStock({ rangement: rangementId, article, quantite });
      onDone();
    },
  });
}

function dialogEditStock({ id, nom, qty }, onDone) {
  openDialog(`Ajuster · ${nom}`, `
    <label class="field"><span>Quantité</span><input type="number" name="quantite" min="0" step="any" required value="${qty}" autofocus /></label>
    <p class="field-hint">${UNIT_HINT}</p>
  `, {
    onSubmit: async (fd) => {
      const quantite = Number(fd.get('quantite'));
      await pb.collection('stocks').update(id, { quantite });
      onDone();
    },
  });
}

/* ── Catalogue ── */
async function renderCatalogue(container, canWrite, refresh) {
  const items = await listCatalogue();

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
      html += `<div class="row">
        <span class="row-text">${escapeHtml(item.nom)}</span>
        <span class="panel-head-actions">
          <span class="row-note">cible : ${item.quantite_cible}</span>
          ${
            canWrite
              ? `<button class="btn-ghost small" data-action="edit-article" data-id="${item.id}" data-nom="${escapeHtml(item.nom)}" data-cible="${item.quantite_cible}">Modifier</button><button class="link-danger" data-action="delete-article" data-id="${item.id}" data-nom="${escapeHtml(item.nom)}">Supprimer</button>`
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
      dialogArticle({ id: editBtn.dataset.id, nom: editBtn.dataset.nom, cible: editBtn.dataset.cible }, refresh);
      return;
    }
    const delBtn = e.target.closest('[data-action="delete-article"]');
    if (delBtn) {
      const nom = delBtn.dataset.nom;
      const ok = await confirmModal(`Supprimer « ${nom} » du catalogue ?`, 'Il sera aussi retiré de tous les rangements où il apparaît.');
      if (ok) deleteCatalogueItem(delBtn.dataset.id).then(refresh).catch((err) => alert(err.message));
    }
  };
}

function dialogArticle(existing, onDone) {
  openDialog(existing ? "Modifier l'article" : 'Ajouter un article', `
    <label class="field"><span>Nom</span><input type="text" name="nom" required autofocus value="${existing ? escapeHtml(existing.nom) : ''}" /></label>
    <label class="field"><span>Quantité cible (stock plein, toute la maison)</span><input type="number" name="quantite_cible" min="1" step="any" required value="${existing ? existing.cible : 1}" /></label>
    <p class="field-hint">${UNIT_HINT}</p>
  `, {
    onSubmit: async (fd) => {
      const nom = fd.get('nom').trim();
      const quantite_cible = Number(fd.get('quantite_cible'));
      if (!nom) throw new Error('Le nom est requis.');
      if (existing) await updateCatalogueItem(existing.id, { nom, quantite_cible });
      else await createCatalogueItem({ nom, quantite_cible });
      onDone();
    },
  });
}

/* ── Dialogue générique (élément <dialog> natif) ── */
function openDialog(title, bodyHtml, { onSubmit, submitLabel = 'Enregistrer' } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'app-dialog';
  dlg.innerHTML = `
    <form method="dialog" class="dialog-form">
      <h3>${escapeHtml(title)}</h3>
      ${bodyHtml}
      <p class="dialog-error" hidden></p>
      <div class="dialog-actions">
        <button type="button" class="btn-ghost" data-close>Annuler</button>
        <button type="submit" class="btn-primary">${escapeHtml(submitLabel)}</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);

  const form = dlg.querySelector('form');
  const errorEl = dlg.querySelector('.dialog-error');
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await onSubmit(new FormData(form));
      dlg.close();
    } catch (err) {
      errorEl.textContent = err.message || 'Une erreur est survenue.';
      errorEl.hidden = false;
      submitBtn.disabled = false;
    }
  });

  dlg.showModal();
  return dlg;
}

// Remplace confirm() natif : modale stylée cohérente avec le design, message
// contextuel (ce qui sera réellement supprimé). Résout à true/false.
function confirmModal(title, message, { confirmLabel = 'Supprimer' } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'app-dialog';
    dlg.innerHTML = `
      <div class="dialog-form dialog-form-confirm">
        <div class="confirm-icon">${icon('alert-triangle')}</div>
        <h3>${escapeHtml(title)}</h3>
        <p class="dialog-sub">${escapeHtml(message)}</p>
        <div class="dialog-actions">
          <button type="button" class="btn-ghost" data-cancel>Annuler</button>
          <button type="button" class="btn-danger" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    const finish = (result) => { dlg.close(); dlg.remove(); resolve(result); };
    dlg.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
    dlg.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
    dlg.addEventListener('cancel', () => finish(false));

    dlg.showModal();
  });
}

function emptyState(iconName, title, text) {
  return `<div class="empty-state"><div class="ic">${icon(iconName)}</div><p><strong>${escapeHtml(title)}</strong></p><p class="small">${escapeHtml(text)}</p></div>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
