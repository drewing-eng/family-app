import { userRole } from '../lib/pocketbase.js';
import { listPlannings, getCurrentPlanning, importPlanning } from '../lib/menus.js';
import { icon } from '../lib/icons.js';

export async function renderMenusTab(container, tab, user, opts = {}) {
  const canWrite = ['admin', 'membre'].includes(userRole(user));

  if (tab !== 'historique') {
    // Jours/Courses/Production : construits aux chantiers suivants (voir
    // CLAUDE.md § Roadmap). En attendant, on sait déjà dire s'il y a un
    // planning importé ou non plutôt que d'afficher un faux "à venir".
    container.innerHTML = '<div class="empty-state small"><p>Chargement…</p></div>';
    try {
      const current = await getCurrentPlanning();
      if (!current) {
        container.innerHTML = emptyState('calendar', 'Aucun menu importé', "Importe un premier planning depuis l'onglet Historique pour voir apparaître les jours, les courses et la production.");
      } else {
        container.innerHTML = emptyState('calendar', 'Écran en construction', 'Cet onglet sera développé au prochain chantier.');
      }
    } catch (err) {
      container.innerHTML = errorState(err);
    }
    return;
  }

  renderHistorique(container, canWrite, opts);
}

async function renderHistorique(container, canWrite, opts) {
  container.innerHTML = '<div class="empty-state small"><p>Chargement…</p></div>';
  let plannings;
  try {
    plannings = await listPlannings();
  } catch (err) {
    container.innerHTML = errorState(err);
    return;
  }

  const currentId = plannings[0]?.id;

  let html = '';
  if (canWrite) {
    html += `<div class="panel import-zone">
      <div class="import-zone-body">
        <div class="import-zone-t">Importer un nouveau planning</div>
        <div class="import-zone-s">Fichier JSON au format Menus (schemaVersion 2). Il devient automatiquement le planning courant.</div>
      </div>
      <button type="button" class="import-btn" id="menuImportBtn">Choisir un fichier</button>
      <input type="file" accept="application/json,.json" id="menuImportInput" hidden />
    </div>
    <p class="drawer-error" id="menuImportError" hidden></p>`;
  }

  html += `<div class="section-head">
    <div>
      <div class="section-head-title">Plannings importés</div>
      <div class="section-head-sub">Lecture seule — le plus récent est le planning courant</div>
    </div>
  </div>`;

  if (!plannings.length) {
    html += emptyState('book', 'Aucun planning', canWrite ? 'Importe ton premier planning ci-dessus.' : 'Aucun planning importé pour l’instant.');
  } else {
    html += '<div class="panel history-panel">';
    plannings.forEach((p) => {
      const isCurrent = p.id === currentId;
      const label = p.label || p.data?.meta?.title || p.data?.meta?.period || 'Planning';
      const dateStr = p.created ? new Date(p.created).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      html += `<div class="row history-row${isCurrent ? ' current' : ''}">
        <div class="row-label">
          <div class="row-text t">${escapeHtml(label)}</div>
          <div class="row-note d">Importé le ${escapeHtml(dateStr)}</div>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  container.innerHTML = html;

  if (canWrite) {
    const fileInput = container.querySelector('#menuImportInput');
    const errorEl = container.querySelector('#menuImportError');
    container.querySelector('#menuImportBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      errorEl.hidden = true;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importPlanning(data);
        renderHistorique(container, canWrite, opts);
      } catch (err) {
        errorEl.textContent = err.message || "Impossible d'importer ce fichier.";
        errorEl.hidden = false;
      } finally {
        fileInput.value = '';
      }
    });
  }
}

function emptyState(iconName, title, text) {
  return `<div class="empty-state"><div class="ic">${icon(iconName)}</div><p><strong>${escapeHtml(title)}</strong></p><p class="small">${escapeHtml(text)}</p></div>`;
}

function errorState(err) {
  return emptyState('alert-triangle', 'Erreur de chargement', err.message || 'Réessaie dans un instant.');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
