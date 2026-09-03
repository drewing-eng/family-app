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

/* ── Gestion : Pièce → Rangement → articles présents ── */
async function renderGestion(container, canWrite, refresh) {
  const [catalogue, pieces, rangements, stocks] = await Promise.all([
    listCatalogue(), listPieces(), listRangements(), listStocks(),
  ]);
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

  if (canWrite) {
    html += `<div class="toolbar"><button class="btn-ghost" data-action="add-piece">+ Ajouter une pièce</button></div>`;
  }

  if (!pieces.length) {
    html += emptyState('door', 'Aucune pièce', canWrite ? 'Ajoute ta première pièce (Cuisine, Salle de bain…) pour commencer.' : 'Aucune pièce créée pour l’instant.');
  } else {
    pieces.forEach((piece) => {
      const piecesRangements = rangements.filter((r) => r.piece === piece.id);
      html += `<div class="section-eyebrow">${escapeHtml(piece.nom)}${
        canWrite
          ? ` <button class="btn-ghost small" data-action="add-rangement" data-piece="${piece.id}" data-piece-nom="${escapeHtml(piece.nom)}">+ Rangement</button> <button class="link-danger" data-action="delete-piece" data-id="${piece.id}" data-nom="${escapeHtml(piece.nom)}">Supprimer</button>`
          : ''
      }</div>`;

      if (!piecesRangements.length) {
        html += `<p class="row-note" style="margin-bottom:14px;">Aucun rangement dans cette pièce.</p>`;
      }

      piecesRangements.forEach((rangement) => {
        const lignes = stocks.filter((s) => s.rangement === rangement.id);
        html += `<div class="panel">
          <div class="panel-head">
            <span class="panel-head-title">${escapeHtml(rangement.nom)}</span>
            ${
              canWrite
                ? `<span class="panel-head-actions"><button class="btn-ghost small" data-action="add-stock" data-rangement="${rangement.id}" data-rangement-nom="${escapeHtml(rangement.nom)}">+ Article</button><button class="link-danger" data-action="delete-rangement" data-id="${rangement.id}" data-nom="${escapeHtml(rangement.nom)}">Supprimer</button></span>`
                : ''
            }
          </div>
          <div class="panel-body" style="padding-top:8px;">`;
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
      });
    });
  }

  container.innerHTML = html;
  container.onclick = (e) => {
    if (e.target.closest('[data-action="add-piece"]')) {
      dialogAddPiece(refresh);
      return;
    }
    const delPiece = e.target.closest('[data-action="delete-piece"]');
    if (delPiece) {
      if (confirm(`Supprimer la pièce « ${delPiece.dataset.nom} » et tous ses rangements ?`)) {
        deletePiece(delPiece.dataset.id).then(refresh).catch((err) => alert(err.message));
      }
      return;
    }
    const addRangement = e.target.closest('[data-action="add-rangement"]');
    if (addRangement) {
      dialogAddRangement({ pieceId: addRangement.dataset.piece, pieceNom: addRangement.dataset.pieceNom }, refresh);
      return;
    }
    const delRangement = e.target.closest('[data-action="delete-rangement"]');
    if (delRangement) {
      if (confirm(`Supprimer le rangement « ${delRangement.dataset.nom} » et son contenu ?`)) {
        deleteRangement(delRangement.dataset.id).then(refresh).catch((err) => alert(err.message));
      }
      return;
    }
    const addStock = e.target.closest('[data-action="add-stock"]');
    if (addStock) {
      const rangementId = addStock.dataset.rangement;
      const already = new Set(stocks.filter((s) => s.rangement === rangementId).map((s) => s.article));
      dialogAddStock({ rangementId, rangementNom: addStock.dataset.rangementNom, catalogue: catalogue.filter((a) => !already.has(a.id)) }, refresh);
      return;
    }
    const editStock = e.target.closest('[data-action="edit-stock"]');
    if (editStock) {
      dialogEditStock({ id: editStock.dataset.id, nom: editStock.dataset.nom, qty: Number(editStock.dataset.qty) }, refresh);
      return;
    }
    const delStock = e.target.closest('[data-action="delete-stock"]');
    if (delStock) {
      if (confirm(`Retirer « ${delStock.dataset.nom} » de ce rangement ?`)) {
        deleteStock(delStock.dataset.id).then(refresh).catch((err) => alert(err.message));
      }
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

  let html = '';
  if (canWrite) {
    html += `<div class="toolbar"><button class="btn-ghost" data-action="add-article">+ Ajouter un article</button></div>`;
  }
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
  container.onclick = (e) => {
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
      if (confirm(`Supprimer l'article « ${nom} » du catalogue (et de tous les rangements où il apparaît) ?`)) {
        deleteCatalogueItem(delBtn.dataset.id).then(refresh).catch((err) => alert(err.message));
      }
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

function emptyState(iconName, title, text) {
  return `<div class="empty-state"><div class="ic">${icon(iconName)}</div><p><strong>${escapeHtml(title)}</strong></p><p class="small">${escapeHtml(text)}</p></div>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
