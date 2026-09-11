import { userRole } from '../lib/pocketbase.js';
import {
  listPlannings, getCurrentPlanning, importPlanning, stripEmoji,
  listCheckedForPlanning, setChecked, uncheckAllForPlanning, subscribeChecked, unsubscribeChecked,
} from '../lib/menus.js';
import { icon } from '../lib/icons.js';

const ADULT_STATUS_LABEL = { deux: 'À deux', solo: 'Solo', absent: 'Absent', invites: 'Invités' };
const BABY_STATUS = { partage: { label: 'Partagé', badge: 'good' }, separe: { label: 'Séparé', badge: 'warn' } };
const CARBS_BADGE = { ok: 'good', eleve: 'warn', bloquant: 'danger' };
const TIME_LEVEL = {
  rien: { label: 'Rien à préparer', badge: 'neutral' },
  peu: { label: 'Peu de temps', badge: 'good' },
  moyen: { label: 'Temps moyen', badge: 'warn' },
  beaucoup: { label: 'Beaucoup de temps', badge: 'danger' },
};

// Jour sélectionné sur l'écran Jours : persiste tant qu'on reste sur
// l'onglet (même mécanisme que currentDetailRangement dans stocks.js).
let selectedDate = null;

export async function renderMenusTab(container, tab, user, opts = {}) {
  const canWrite = ['admin', 'membre'].includes(userRole(user));

  // Une seule souscription temps réel possible à la fois (voir
  // lib/menus.js:unsubscribeChecked, topic global à la collection) : on la
  // referme à chaque rendu, elle ne sera rouverte que si tab === 'courses'.
  unsubscribeChecked();

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
    } else if (tab === 'courses') {
      await renderCourses(container, current);
    } else if (tab === 'production') {
      renderProduction(container, current);
    }
  } catch (err) {
    container.innerHTML = errorState(err);
  }
}

/* ── Courses ── */
async function renderCourses(container, planning) {
  const categories = planning.data?.courses || [];
  if (!categories.length) {
    container.innerHTML = emptyState('box', 'Aucune liste de courses', 'Ce planning ne contient pas de liste de courses.');
    return;
  }

  // item_key -> booléen coché, partagé entre tous les membres (voir
  // CLAUDE.md § Modèle de données PocketBase — module Menus).
  const checkedMap = new Map((await listCheckedForPlanning(planning.id)).map((r) => [r.item_key, r.checked]));

  function paint() {
    const anyChecked = [...checkedMap.values()].some(Boolean);
    let html = `<div class="section-head">
      <div>
        <div class="section-head-title">Courses</div>
        <div class="section-head-sub">Coché par n'importe quel membre, visible par tous en direct</div>
      </div>
      ${anyChecked ? `<div class="section-head-actions"><button type="button" class="btn-ghost small" data-action="uncheck-all">Tout décocher</button></div>` : ''}
    </div>`;

    categories.forEach((cat) => {
      html += `<div class="course-cat">
        <div class="course-cat-head"><span class="course-cat-ic">${escapeHtml(catInitials(cat.category))}</span><span class="course-cat-name">${escapeHtml(cat.category)}</span></div>
        <div class="course-panel">
          ${(cat.items || []).map((item) => courseItemHtml(item, checkedMap.get(item.id) || false)).join('')}
        </div>
      </div>`;
    });

    container.innerHTML = html;
    wireEvents();
  }

  function setItemChecked(key, checked) {
    const el = container.querySelector(`.course-item[data-key="${CSS.escape(key)}"]`);
    if (!el) return;
    el.classList.toggle('checked', checked);
  }

  function wireEvents() {
    container.onclick = async (e) => {
      if (e.target.closest('[data-action="uncheck-all"]')) {
        checkedMap.forEach((v, k) => checkedMap.set(k, false));
        paint();
        try {
          await uncheckAllForPlanning(planning.id);
        } catch (err) {
          alert(err.message || "Impossible de tout décocher.");
        }
        return;
      }
      const item = e.target.closest('.course-item');
      if (item) {
        const key = item.dataset.key;
        const next = !item.classList.contains('checked');
        checkedMap.set(key, next);
        item.classList.toggle('checked', next);
        try {
          await setChecked(planning.id, key, next);
        } catch (err) {
          // Rétablit l'état affiché si l'écriture échoue (ex. hors ligne).
          checkedMap.set(key, !next);
          item.classList.toggle('checked', !next);
          alert(err.message || "Impossible d'enregistrer.");
        }
      }
    };
  }

  paint();

  // Synchronisation temps réel : un autre membre coche/décoche depuis son
  // propre appareil → mise à jour ciblée du DOM, sans repeindre tout
  // l'écran (évite de perdre le scroll pendant qu'on fait ses courses).
  subscribeChecked(planning.id, (record, action) => {
    const checked = action === 'delete' ? false : record.checked;
    checkedMap.set(record.item_key, checked);
    setItemChecked(record.item_key, checked);
  });
}

function courseItemHtml(item, checked) {
  return `<button type="button" class="course-item${checked ? ' checked' : ''}" data-key="${escapeHtml(item.id)}">
    <span class="course-check"></span>
    <div><div class="course-text">${escapeHtml(item.text)}</div>${item.note ? `<div class="course-note">${escapeHtml(item.note)}</div>` : ''}</div>
  </button>`;
}

function catInitials(category) {
  return (category || '')
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
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

/* ── Production ── */
function renderProduction(container, planning) {
  const days = (planning.data?.days || []).filter((d) => !d.special && d.production);

  if (!days.length) {
    container.innerHTML = emptyState('calendar', 'Rien à produire', 'Ce planning ne contient pas de plan de production.');
    return;
  }

  const html = days.map((day) => {
    const prod = day.production;
    const level = TIME_LEVEL[prod.timeLevel] || { label: prod.timeLevel, badge: 'neutral' };

    let card = `<div class="prod-day">
      <div class="prod-day-head"><h4>${escapeHtml(day.label)} ${escapeHtml(day.displayDate)}</h4><span class="badge ${level.badge}">${escapeHtml(level.label)}</span></div>
      ${prod.sublabel ? `<div class="prod-sub">${escapeHtml(stripEmoji(prod.sublabel))}</div>` : ''}`;

    (prod.sections || []).forEach((section) => {
      card += `<div class="prod-section">
        <div class="prod-section-title">${escapeHtml(stripEmoji(section.title))}</div>
        <ul>${(section.items || []).map((it) => `<li>${escapeHtml(stripEmoji(it))}</li>`).join('')}</ul>
      </div>`;
    });

    if (prod.baby) {
      card += `<div class="prod-baby">
        <div class="prod-section-title">${escapeHtml(stripEmoji(prod.baby.title))}</div>
        <ul>${(prod.baby.items || []).map((it) => `<li>${escapeHtml(stripEmoji(it))}</li>`).join('')}</ul>
      </div>`;
    }

    card += '</div>';
    return card;
  }).join('');

  container.innerHTML = html;
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
