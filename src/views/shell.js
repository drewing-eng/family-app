import { pb, logout, userRole, userApps, updateTheme } from '../lib/pocketbase.js';
import { applyTheme, currentThemeAttr } from '../lib/theme.js';
import { renderStocksTab } from './stocks.js';
import { icon } from '../lib/icons.js';
import { initDrawer } from '../lib/drawer.js';

const ROLE_LABEL = { admin: 'Admin', membre: 'Membre', invite: 'Invité' };

const ALL_MODULES = [
  { id: 'wall', icon: 'home', label: 'Accueil', always: true },
  { id: 'menus', icon: 'calendar', label: 'Menus' },
  { id: 'stocks', icon: 'box', label: 'Stocks' },
];

const STOCK_TABS = [
  { id: 'gestion', label: 'Gestion' },
  { id: 'catalogue', label: 'Catalogue' },
];

function initials(user) {
  const name = user?.name || user?.email || '?';
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('') || '?';
}

function hashModule() {
  const m = (location.hash || '').replace(/^#\/?/, '');
  return ['wall', 'menus', 'stocks'].includes(m) ? m : 'wall';
}

export function renderShell(root) {
  const user = pb.authStore.record;
  const allowed = userApps(user);
  const modules = ALL_MODULES.filter((m) => m.always || allowed.includes(m.id));
  const state = { module: hashModule(), stockTab: 'gestion' };
  if (!modules.some((m) => m.id === state.module)) state.module = 'wall';

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="name">GAUTIER Family</div>
          <div class="tag">Foyer numérique</div>
        </div>
        <nav class="side-nav" id="sideNav"></nav>
        <div class="side-profile">
          <div class="avatar">${initials(user)}</div>
          <div class="who">
            <div class="n">${escapeHtml(user?.name || user?.email || '')}</div>
            <div class="r">${ROLE_LABEL[userRole(user)] || 'Invité'}</div>
          </div>
          <button class="icon-btn" id="themeBtnDesktop" title="Changer de thème"></button>
          <button class="icon-btn" id="logoutBtnDesktop" title="Se déconnecter">${icon('logout')}</button>
        </div>
      </aside>

      <div class="mobile-header">
        <h1 id="mobileTitle">GAUTIER Family</h1>
        <button class="icon-btn" id="themeBtnMobile" title="Changer de thème"></button>
        <button class="icon-btn" id="logoutBtnMobile" title="Se déconnecter">${icon('logout')}</button>
        <button class="icon-chip" id="mobileClose" hidden aria-label="Fermer le module, retour à l'accueil">${icon('x')}</button>
      </div>

      <main class="main">
        <div class="pane-title"><h2 id="paneTitle">Accueil</h2></div>
        <div class="subtabs-desktop" id="subtabsDesktop"></div>
        <div class="content-body" id="contentBody"></div>
      </main>

      <nav class="subtabs-mobile" id="subtabsMobile"></nav>

      <aside id="drawer">
        <div class="drawer-frame">
          <div class="drawer-card">
            <div class="drawer-head">
              <h3 id="drawerTitle">Titre</h3>
              <button class="icon-chip" id="drawerClose" aria-label="Fermer">${icon('x')}</button>
            </div>
            <div class="drawer-body" id="drawerBody"></div>
          </div>
        </div>
      </aside>
    </div>
    <div id="scrim" hidden></div>
  `;

  initDrawer();

  const sideNav = root.querySelector('#sideNav');
  const contentBody = root.querySelector('#contentBody');
  const paneTitle = root.querySelector('#paneTitle');
  const mobileTitle = root.querySelector('#mobileTitle');
  const mobileClose = root.querySelector('#mobileClose');
  const subtabsDesktop = root.querySelector('#subtabsDesktop');
  const subtabsMobile = root.querySelector('#subtabsMobile');

  function moduleInfo(id) {
    return modules.find((m) => m.id === id) || modules[0];
  }

  function render() {
    location.hash = `#/${state.module}`;

    // Couleur par module (voir #app[data-module] dans tokens.css) : bleu par
    // défaut pour Accueil/Menus, teinte dédiée dès qu'on entre dans un
    // module qui en a une (Stocks aujourd'hui). `root` est directement
    // l'élément #app (passé par main.js), donc le sélecteur CSS s'applique
    // sans wrapper supplémentaire.
    root.dataset.module = state.module;

    sideNav.innerHTML = modules
      .map(
        (m) =>
          `<button class="side-item${m.id === state.module ? ' active' : ''}" data-nav="${m.id}"><span class="ic">${icon(m.icon)}</span>${m.label}</button>`
      )
      .join('') +
      `<button class="side-item disabled" disabled><span class="ic">${icon('coin')}</span>Finances<span class="soon">bientôt</span></button>`;

    const info = moduleInfo(state.module);
    paneTitle.textContent = info.label;

    if (state.module === 'wall') {
      mobileClose.hidden = true;
      mobileTitle.textContent = 'GAUTIER Family';
    } else {
      mobileClose.hidden = false;
      mobileTitle.textContent = info.label;
    }

    if (state.module === 'stocks') {
      const tabsHtml = STOCK_TABS.map(
        (t) => `<button class="tab-btn${t.id === state.stockTab ? ' active' : ''}" data-stocktab="${t.id}">${t.label}</button>`
      ).join('');
      // Sous-onglets identiques sur les deux gabarits ; la jauge "% hors
      // tension" n'existe qu'en desktop (place manquante sur mobile — voir
      // design-systeme.md), ajoutée après coup dans subtabsDesktop une fois
      // le résumé connu (onSummary, ci-dessous).
      subtabsDesktop.innerHTML = tabsHtml;
      subtabsMobile.innerHTML = tabsHtml;
      contentBody.classList.add('has-subtabs');
      renderStocksTab(contentBody, state.stockTab, user, {
        onSummary: ({ tense, total }) => {
          const pct = total > 0 ? Math.round(((total - tense) / total) * 100) : 100;
          const existing = subtabsDesktop.querySelector('.subtabs-gauge');
          if (existing) existing.outerHTML = gaugeHtml(pct);
          else subtabsDesktop.insertAdjacentHTML('beforeend', gaugeHtml(pct));
        },
      });
    } else {
      subtabsDesktop.innerHTML = '';
      subtabsMobile.innerHTML = '';
      contentBody.classList.remove('has-subtabs');
      contentBody.innerHTML = renderContent(state.module, modules);
    }
  }

  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      state.module = nav.getAttribute('data-nav');
      state.stockTab = 'gestion';
      render();
      return;
    }
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      state.module = goto.getAttribute('data-goto');
      state.stockTab = 'gestion';
      render();
      return;
    }
    const stocktab = e.target.closest('[data-stocktab]');
    if (stocktab) {
      state.stockTab = stocktab.getAttribute('data-stocktab');
      render();
      return;
    }
    if (e.target.closest('#mobileClose')) {
      state.module = 'wall';
      render();
      return;
    }
    if (e.target.closest('#themeBtnDesktop') || e.target.closest('#themeBtnMobile')) {
      const next = currentThemeAttr() === 'sombre' ? 'clair' : 'sombre';
      applyTheme(next);
      syncThemeButtons();
      updateTheme(next).catch(() => {});
      return;
    }
    if (e.target.closest('#logoutBtnDesktop') || e.target.closest('#logoutBtnMobile')) {
      logout();
      return;
    }
  });

  window.addEventListener('hashchange', () => {
    const next = hashModule();
    if (modules.some((m) => m.id === next) && next !== state.module) {
      state.module = next;
      state.stockTab = 'gestion';
      render();
    }
  });

  function syncThemeButtons() {
    const svg = currentThemeAttr() === 'sombre' ? icon('moon') : icon('sun');
    root.querySelector('#themeBtnDesktop').innerHTML = svg;
    root.querySelector('#themeBtnMobile').innerHTML = svg;
  }

  syncThemeButtons();
  render();
}

// Jauge circulaire compacte (maquette : écran Stocks desktop, à côté des
// sous-onglets) — % du catalogue hors tension, recalculée à chaque résumé
// fourni par stocks.js (onSummary), sans refetch dédié côté coquille.
function gaugeHtml(pct) {
  const r = 21;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return `<div class="subtabs-gauge">
    <svg width="48" height="48" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--panel)" stroke-width="6"/>
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 26 26)"/>
      <text x="26" y="30" text-anchor="middle" font-size="13" font-weight="800" fill="var(--text)" font-family="Manrope">${pct}%</text>
    </svg>
    <span class="subtabs-gauge-text">du catalogue<br>hors tension</span>
  </div>`;
}

function renderContent(moduleId, modules) {
  if (moduleId === 'wall') return renderWall(modules);
  if (moduleId === 'menus') {
    return emptyState('calendar', 'Connexion à créer', "L'URL de production de family-menu n'a pas encore été renseignée. Une fois fournie, cet espace affichera l'application en iframe.");
  }
  return '';
}

function renderWall(modules) {
  let html = `
    <div class="wall-header">
      <div class="hello">Bonjour</div>
      <h1>Le mur de la famille</h1>
    </div>
    <div class="empty-state small">
      <p>Le menu du jour et les alertes de stock arriveront ici au chantier 4.</p>
    </div>`;

  const tiles = modules.filter((m) => m.id !== 'wall');
  if (tiles.length) {
    html += '<div class="mobile-modules"><div class="section-eyebrow">Modules</div><div class="tiles">';
    tiles.forEach((m) => {
      html += `<button class="tile" data-goto="${m.id}"><span class="tile-ic-chip">${icon(m.icon)}</span><span class="lbl">${m.label}</span></button>`;
    });
    html += `<button class="tile disabled" disabled><span class="tile-ic-chip">${icon('coin')}</span><span class="lbl">Finances</span></button>`;
    html += '</div></div>';
  }
  return html;
}

function emptyState(iconName, title, text) {
  return `<div class="empty-state"><div class="ic">${icon(iconName)}</div><p><strong>${escapeHtml(title)}</strong></p><p class="small">${escapeHtml(text)}</p></div>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
