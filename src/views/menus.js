import { userRole } from '../lib/pocketbase.js';
import { listPlannings, getCurrentPlanning, importPlanning, stripEmoji } from '../lib/menus.js';
import { icon } from '../lib/icons.js';

const ADULT_STATUS_LABEL = { deux: 'À deux', solo: 'Solo', absent: 'Absent', invites: 'Invités' };
const BABY_STATUS = { partage: { label: 'Partagé', badge: 'good' }, separe: { label: 'Séparé', badge: 'warn' } };
const CARBS_BADGE = { ok: 'good', eleve: 'warn', bloquant: 'danger' };

// Jour sélectionné sur l'écran Jours : persiste tant qu'on reste sur
// l'onglet (même mécanisme que currentDetailRangement dans stocks.js).
let selectedDate = null;

export async function renderMenusTab(container, tab, user, opts = {}) {
  const canWrite = ['admin', 'membre'].includes(userRole(user));

  if (tab === 'historique') {
    renderHistorique(container, canWrite, opts);
    return;
  }

  container.innerHTML = '<div class="empty-state small"><p>Chargement…</p></div>';
  try {
    const current = await getCurrentPlanning();
    if (!current) {
      container.innerHTML = emptyState('calendar', 'Aucun menu importé', "Importe un premier planning depuis l'onglet Historique pour voir apparaître les jours, les courses et la production.");
      return;
    }
    if (tab === 'jours') {
      renderJours(container, current);
    } else {
      // Courses/Production : construits aux chantiers suivants (voir
      // CLAUDE.md § Roadmap) — le planning existe déjà, seul l'écran manque.
      container.innerHTML = emptyState('calendar', 'Écran en construction', 'Cet onglet sera développé au prochain chantier.');
    }
  } catch (err) {
    container.innerHTML = errorState(err);
  }
}

/* ── Jours ── */
function renderJours(container, planning) {
  const days = planning.data?.days || [];
  if (!days.length) {
    container.innerHTML = emptyState('calendar', 'Planning vide', 'Ce planning ne contient aucun jour.');
    return;
  }

  if (!days.some((d) => d.date === selectedDate)) {
    const today = new Date().toISOString().slice(0, 10);
    selectedDate = (days.find((d) => d.date === today) || days[0]).date;
  }

  function paint() {
    const day = days.find((d) => d.date === selectedDate) || days[0];

    const strip = days.map((d) => {
      const n = (d.displayDate.match(/\d+/) || [''])[0];
      const classes = ['day-chip'];
      if (d.date === day.date) classes.push('active');
      if (d.special) classes.push('special');
      return `<button type="button" class="${classes.join(' ')}" data-date="${d.date}"><span class="l">${escapeHtml(d.label.slice(0, 3))}</span><span class="n">${escapeHtml(n)}</span></button>`;
    }).join('');

    let html = `<div class="day-strip">${strip}</div>`;

    if (day.special) {
      html += `<div class="day-head"><div><h3>${escapeHtml(day.label)}</h3><div class="sub">${escapeHtml(day.displayDate)}</div></div></div>
        <div class="special-card"><strong>${escapeHtml(stripEmoji(day.special))}</strong></div>`;
    } else {
      html += `<div class="day-head">
        <div><h3>${escapeHtml(day.label)}</h3><div class="sub">${escapeHtml(day.displayDate)}</div></div>
        ${day.carbs ? `<span class="badge ${CARBS_BADGE[day.carbs.level] || 'neutral'}">${day.carbs.percent}% glucides</span>` : ''}
      </div>`;

      html += `<div class="section-eyebrow">Adultes</div><div class="meal-grid">${mealCard('Midi', day.adult?.midi)}${mealCard('Soir', day.adult?.soir)}</div>`;

      html += `<div class="section-eyebrow">Bébé</div><div class="baby-panel">
        ${babyRow('Midi', day.baby?.midi)}${babyRow('Goûter', day.baby?.gouter)}${babyRow('Soir', day.baby?.soir)}
      </div>`;
    }

    html += `<p class="disclaimer">Les bilans glucides sont des estimations approximatives basées sur des valeurs moyennes.</p>`;

    container.innerHTML = html;
    container.querySelectorAll('.day-chip').forEach((chip) => {
      chip.addEventListener('click', () => { selectedDate = chip.dataset.date; paint(); });
    });

    // Le bandeau de jours défile horizontalement (potentiellement plus de
    // jours que de place visible) — la puce du jour sélectionné doit
    // toujours être visible sans scroll manuel, à l'ouverture comme après
    // un clic. `block: 'nearest'` pour ne jamais faire sauter la page.
    const activeChip = container.querySelector('.day-chip.active');
    if (activeChip) activeChip.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  paint();
}

function mealCard(slot, meal) {
  if (!meal) return `<div class="meal-card"><div class="meal-card-head"><span class="slot">${escapeHtml(slot)}</span></div></div>`;
  const dish = escapeHtml(stripEmoji(meal.dish));
  const dishHtml = meal.recipeUrl
    ? `<a href="${escapeHtml(meal.recipeUrl)}" target="_blank" rel="noopener">${dish} ↗</a>`
    : dish;
  return `<div class="meal-card">
    <div class="meal-card-head"><span class="slot">${escapeHtml(slot)}</span><span class="badge neutral">${escapeHtml(ADULT_STATUS_LABEL[meal.status] || meal.status)}</span></div>
    <div class="meal-dish">${dishHtml}</div>
    ${meal.detail ? `<div class="meal-detail">${escapeHtml(stripEmoji(meal.detail))}</div>` : ''}
  </div>`;
}

function babyRow(slot, meal) {
  if (!meal) return '';
  const status = BABY_STATUS[meal.status];
  const lotLine = meal.lot && meal.dayOfLot ? `<div class="lot">${escapeHtml(meal.lot)} · jour ${escapeHtml(meal.dayOfLot)}</div>` : '';
  const detailLine = meal.detail ? `<div class="lot">${escapeHtml(stripEmoji(meal.detail))}</div>` : '';
  return `<div class="baby-row">
    <span class="slot">${escapeHtml(slot)}</span>
    <div class="body"><div class="dish">${escapeHtml(stripEmoji(meal.dish))}</div>${lotLine}${detailLine}</div>
    ${status ? `<span class="badge ${status.badge}">${status.label}</span>` : ''}
  </div>`;
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
