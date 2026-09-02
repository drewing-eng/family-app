import { userRole } from '../lib/pocketbase.js';
import {
  listCatalogue, createCatalogueItem, updateCatalogueItem, deleteCatalogueItem,
  listCoffres, listEmplacements, createCoffre, deleteCoffre, updateEmplacement,
  listHistorique, isTension,
} from '../lib/stocks.js';

export async function renderStocksTab(container, tab, user) {
  const canWrite = ['admin', 'membre'].includes(userRole(user));
  const refresh = () => renderStocksTab(container, tab, user);

  container.innerHTML = '<div class="empty-state small"><p>Chargement…</p></div>';
  try {
    if (tab === 'catalogue') await renderCatalogue(container, canWrite, refresh);
    else if (tab === 'journal') await renderJournal(container);
    else await renderGestion(container, canWrite, refresh);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="ic">⚠️</div><p><strong>Erreur de chargement</strong></p><p class="small">${escapeHtml(err.message || 'Réessaie dans un instant.')}</p></div>`;
  }
}

/* ── Gestion ── */
async function renderGestion(container, canWrite, refresh) {
  const [coffres, catalogue] = await Promise.all([listCoffres(), listCatalogue()]);
  const withSlots = await Promise.all(
    coffres.map(async (coffre) => ({ coffre, slots: await listEmplacements(coffre.id) }))
  );

  let html = '';
  if (canWrite) {
    html += `<div class="toolbar"><button class="btn-ghost" data-action="add-coffre">+ Ajouter un coffre</button></div>`;
  }
  if (!withSlots.length) {
    html += emptyState('📦', 'Aucun coffre', canWrite ? 'Ajoute ton premier coffre pour commencer.' : 'Aucun coffre créé pour l’instant.');
  } else {
    withSlots.forEach(({ coffre, slots }) => {
      html += `<div class="section-eyebrow">${escapeHtml(coffre.nom)}${
        canWrite ? ` <button class="link-danger" data-action="delete-coffre" data-id="${coffre.id}" data-nom="${escapeHtml(coffre.nom)}">Supprimer</button>` : ''
      }</div>`;
      html += '<div class="panel"><div class="panel-body" style="padding-top:8px;">';
      slots.forEach((slot) => {
        const article = slot.expand?.article;
        const tension = article && isTension(slot.quantite, article.quantite_max);
        const sub = article
          ? tension
            ? '<span class="gluco eleve"><span class="gluco-dot"></span>Stock en tension</span>'
            : `<span class="row-note">${slot.quantite} / ${article.quantite_max}</span>`
          : '<span class="row-note" style="font-style:italic;">Vide</span>';
        html += `<div class="row">
          <div><div class="row-text">${article ? escapeHtml(article.nom) : `Emplacement ${slot.index}`}</div>${sub}</div>
          ${
            canWrite
              ? `<button class="btn-ghost small" data-action="edit-slot" data-id="${slot.id}" data-coffre="${escapeHtml(coffre.nom)}" data-index="${slot.index}" data-article="${article ? article.id : ''}" data-qty="${slot.quantite}">${article ? 'Ajuster' : 'Assigner'}</button>`
              : ''
          }
        </div>`;
      });
      html += '</div></div>';
    });
  }

  container.innerHTML = html;
  container.onclick = (e) => {
    if (e.target.closest('[data-action="add-coffre"]')) {
      dialogAddCoffre(refresh);
      return;
    }
    const delBtn = e.target.closest('[data-action="delete-coffre"]');
    if (delBtn) {
      const nom = delBtn.dataset.nom;
      if (confirm(`Supprimer le coffre « ${nom} » et tous ses emplacements ?`)) {
        deleteCoffre(delBtn.dataset.id).then(refresh).catch((err) => alert(err.message));
      }
      return;
    }
    const editBtn = e.target.closest('[data-action="edit-slot"]');
    if (editBtn) {
      const d = editBtn.dataset;
      dialogEditSlot({ id: d.id, coffreNom: d.coffre, index: d.index, articleId: d.article, qty: Number(d.qty) }, catalogue, refresh);
    }
  };
}

function dialogAddCoffre(onDone) {
  openDialog('Ajouter un coffre', `
    <label class="field"><span>Nom</span><input type="text" name="nom" required autofocus /></label>
    <label class="field"><span>Nombre d'emplacements</span><input type="number" name="nb_emplacements" min="1" max="50" required value="6" /></label>
  `, {
    onSubmit: async (fd) => {
      const nom = fd.get('nom').trim();
      if (!nom) throw new Error('Le nom est requis.');
      await createCoffre({ nom, nb_emplacements: Number(fd.get('nb_emplacements')) });
      onDone();
    },
  });
}

function dialogEditSlot({ id, coffreNom, index, articleId, qty }, catalogue, onDone) {
  const options = catalogue
    .map((a) => `<option value="${a.id}" ${a.id === articleId ? 'selected' : ''}>${escapeHtml(a.nom)} (max ${a.quantite_max})</option>`)
    .join('');
  openDialog(`Emplacement ${index} · ${coffreNom}`, `
    <label class="field"><span>Article</span>
      <select name="article">
        <option value="">— Vider l'emplacement —</option>
        ${options}
      </select>
    </label>
    <label class="field"><span>Quantité</span><input type="number" name="quantite" min="0" required value="${qty}" /></label>
  `, {
    onSubmit: async (fd) => {
      const articleId2 = fd.get('article') || '';
      const article = catalogue.find((a) => a.id === articleId2);
      let newQty = Number(fd.get('quantite'));
      if (!articleId2) newQty = 0;
      if (article && newQty > article.quantite_max) {
        throw new Error(`La quantité dépasse le maximum du catalogue (${article.quantite_max}).`);
      }
      await updateEmplacement({
        emplacement: id,
        coffreNom,
        articleId: articleId2 || null,
        articleNom: article?.nom,
        previousQuantite: qty,
        newQuantite: newQty,
      });
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
  if (!items.length) {
    html += emptyState('📖', 'Catalogue vide', canWrite ? 'Ajoute le premier article du catalogue.' : 'Aucun article pour l’instant.');
  } else {
    html += '<div class="panel"><div class="panel-body" style="padding-top:8px;">';
    items.forEach((item) => {
      html += `<div class="row">
        <span class="row-text">${escapeHtml(item.nom)}</span>
        <span style="display:flex;align-items:center;gap:10px;">
          <span class="row-note">max ${item.quantite_max}</span>
          ${
            canWrite
              ? `<button class="btn-ghost small" data-action="edit-article" data-id="${item.id}" data-nom="${escapeHtml(item.nom)}" data-max="${item.quantite_max}">Modifier</button><button class="link-danger" data-action="delete-article" data-id="${item.id}" data-nom="${escapeHtml(item.nom)}">Supprimer</button>`
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
      dialogArticle({ id: editBtn.dataset.id, nom: editBtn.dataset.nom, max: editBtn.dataset.max }, refresh);
      return;
    }
    const delBtn = e.target.closest('[data-action="delete-article"]');
    if (delBtn) {
      const nom = delBtn.dataset.nom;
      if (confirm(`Supprimer l'article « ${nom} » du catalogue ?`)) {
        deleteCatalogueItem(delBtn.dataset.id).then(refresh).catch((err) => alert(err.message));
      }
    }
  };
}

function dialogArticle(existing, onDone) {
  openDialog(existing ? "Modifier l'article" : 'Ajouter un article', `
    <label class="field"><span>Nom</span><input type="text" name="nom" required autofocus value="${existing ? escapeHtml(existing.nom) : ''}" /></label>
    <label class="field"><span>Quantité maximum par emplacement</span><input type="number" name="quantite_max" min="1" required value="${existing ? existing.max : 1}" /></label>
  `, {
    onSubmit: async (fd) => {
      const nom = fd.get('nom').trim();
      const quantite_max = Number(fd.get('quantite_max'));
      if (!nom) throw new Error('Le nom est requis.');
      if (existing) await updateCatalogueItem(existing.id, { nom, quantite_max });
      else await createCatalogueItem({ nom, quantite_max });
      onDone();
    },
  });
}

/* ── Journal ── */
async function renderJournal(container) {
  const entries = await listHistorique();
  if (!entries.length) {
    container.innerHTML = emptyState('📋', 'Aucun mouvement', 'Les ajouts et retraits de stock apparaîtront ici.');
    container.onclick = null;
    return;
  }
  let html = '<div class="history-list">';
  entries.forEach((e) => {
    const sign = e.type === 'ajout' ? '+' : '−';
    const when = new Date(e.created).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    html += `<div class="history-entry">
      <div>
        <div class="history-entry-title">${e.type === 'ajout' ? 'Ajout' : 'Retrait'} · ${escapeHtml(e.article_nom)} (${sign}${e.quantite})</div>
        <div class="history-entry-meta">${escapeHtml(e.coffre_nom)}</div>
      </div>
      <div class="history-entry-meta">${when}</div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
  container.onclick = null;
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

function emptyState(icon, title, text) {
  return `<div class="empty-state"><div class="ic">${icon}</div><p><strong>${escapeHtml(title)}</strong></p><p class="small">${escapeHtml(text)}</p></div>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
