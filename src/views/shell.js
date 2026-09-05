import { pb, logout, userRole, userApps, updateTheme } from '../lib/pocketbase.js';
import { applyTheme, currentThemeAttr } from '../lib/theme.js';
import { renderStocksTab } from './stocks.js';
import { tensionItems } from '../lib/stocks.js';
import { renderAdminTab } from './admin.js';
import { renderAccountTab } from './account.js';
import { icon } from '../lib/icons.js';
import { initDrawer } from '../lib/drawer.js';

const ROLE_LABEL = { admin: 'Admin', membre: 'Membre', invite: 'Invité' };

const ALL_MODULES = [
  { id: 'wall', icon: 'home', label: 'Accueil', always: true },
  { id: 'menus', icon: 'calendar', label: 'Menus' },
  { id: 'stocks', icon: 'box', label: 'Stocks' },
  // Gérée par rôle plutôt que par apps_autorisees (comme Wall/Finances) :
  // Admin peut tout, Membre voit en lecture seule, Invité n'y a pas accès du
  // tout — indépendant des applications ouvertes de chacun.
  { id: 'admin', icon: 'users', label: 'Admin', roles: ['admin', 'membre'] },
];

// "Mon compte" n'est pas dans ALL_MODULES : pas de tuile/item de nav dédié,
// on y accède en cliquant son propre profil (avatar/nom, sidebar ou en-tête
// mobile) — toujours accessible, quel que soit le rôle.
const ACCOUNT_MODULE = { id: 'compte', label: 'Mon compte' };

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
  return ['wall', 'menus', 'stocks', 'admin', 'compte'].includes(m) ? m : 'wall';
}

export function renderShell(root) {
  const user = pb.authStore.record;
  const allowed = userApps(user);
  const role = userRole(user);
  const modules = ALL_MODULES.filter((m) => (m.roles ? m.roles.includes(role) : m.always || allowed.includes(m.id)));
  const state = { module: hashModule(), stockTab: 'gestion' };
  if (state.module !== 'compte' && !modules.some((m) => m.id === state.module)) state.module = 'wall';

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="name">GAUTIER Family</div>
          <div class="tag">Foyer numérique</div>
        </div>
        <nav class="side-nav" id="sideNav"></nav>
        <div class="side-profile">
          <button class="side-profile-btn" data-nav="compte" title="Mon compte">
            <div class="avatar">${initials(user)}</div>
            <div class="who">
              <div class="n">${escapeHtml(user?.name || user?.email || '')}</div>
              <div class="r">${ROLE_LABEL[userRole(user)] || 'Invité'}</div>
            </div>
          </button>
          <button class="icon-btn" id="themeBtnDesktop" title="Changer de thème"></button>
          <button class="icon-btn" id="logoutBtnDesktop" title="Se déconnecter">${icon('logout')}</button>
        </div>
      </aside>

      <div class="mobile-header">
        <button class="avatar avatar-btn" data-nav="compte" title="Mon compte">${initials(user)}</button>
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
    if (id === 'compte') return ACCOUNT_MODULE;
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
      if (state.module === 'admin') {
        renderAdminTab(contentBody, user);
      } else if (state.module === 'compte') {
        renderAccountTab(contentBody, user, { onUpdated: syncProfileDisplay });
      } else {
        contentBody.innerHTML = renderContent(state.module, modules);
        if (state.module === 'wall') fillWallWidgets(contentBody, modules);
      }
    }
  }

  // Après un enregistrement réussi dans "Mon compte" : le profil rendu au
  // montage du shell (avatar/nom dans la sidebar et l'en-tête mobile) ne se
  // met pas à jour tout seul — pb.authStore.record est déjà à jour (voir
  // refreshSession() dans account.js), il ne reste qu'à repeindre ces deux
  // endroits, sans reconstruire tout le shell.
  function syncProfileDisplay() {
    const u = pb.authStore.record;
    root.querySelectorAll('.avatar').forEach((el) => { el.textContent = initials(u); });
    const nameEl = root.querySelector('.side-profile .n');
    if (nameEl) nameEl.textContent = u?.name || u?.email || '';
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
    if ((next === 'compte' || modules.some((m) => m.id === next)) && next !== state.module) {
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
  const allowedIds = modules.map((m) => m.id);
  let html = `
    <div class="wall-header">
      <div class="hello">Bonjour</div>
      <h1>Le mur de la famille</h1>
    </div>`;

  // Widgets : un par module qui a quelque chose de réel à montrer. Stocks
  // est rempli après coup par fillWallWidgets() (données PocketBase) ; Menus
  // reste un placeholder tant que l'URL de production de family-menu n'est
  // pas fournie (chantier 4) — jamais de contenu inventé à sa place.
  let widgets = '';
  if (allowedIds.includes('menus')) widgets += menusPlaceholderWidget();
  if (allowedIds.includes('stocks')) widgets += '<div id="wallStockWidget"></div>';
  if (widgets) html += `<div class="wall-widgets">${widgets}</div>`;

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

function menusPlaceholderWidget() {
  return `<div class="wall-widget wall-widget-placeholder">
    <div class="wall-widget-head"><span class="wall-widget-title">Menu du jour</span></div>
    <p class="row-note">Connexion à créer — l'URL de production de family-menu n'est pas encore renseignée.</p>
  </div>`;
}

function stockWidgetHtml(items) {
  if (!items.length) return ''; // rien en tension : pas de widget plutôt qu'un "0" creux
  const rows = items.slice(0, 4).map((a) => {
    const pct = Math.max(0, Math.min(100, (a.total / a.quantite_cible) * 100));
    const unite = a.unite ? ` ${escapeHtml(a.unite)}` : '';
    return `<div class="wall-widget-row">
      <div class="wall-widget-row-head"><span>${escapeHtml(a.nom)}</span><span>${a.total} / ${a.quantite_cible}${unite}</span></div>
      <div class="wall-widget-bar"><div class="wall-widget-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
  return `<button class="wall-widget" data-goto="stocks">
    <div class="wall-widget-head"><span class="wall-widget-title">Stocks en tension</span><span class="badge accent">${items.length}</span></div>
    <div class="wall-widget-rows">${rows}</div>
  </button>`;
}

// Rempli après coup (comme la jauge desktop de Stocks) : le Wall se peint
// tout de suite, le widget Stocks apparaît dès que ses données PocketBase
// arrivent, sans bloquer le reste de l'écran.
async function fillWallWidgets(container, modules) {
  const grid = container.querySelector('.wall-widgets');
  if (!grid) return;
  if (modules.some((m) => m.id === 'stocks')) {
    const slot = grid.querySelector('#wallStockWidget');
    if (slot) {
      try {
        const html = stockWidgetHtml(await tensionItems());
        if (html) slot.outerHTML = html;
        else slot.remove();
      } catch {
        slot.remove(); // pas de vraie donnée disponible : pas de widget, jamais de contenu inventé
      }
    }
  }
  if (!grid.children.length) grid.remove();
}

function emptyState(iconName, title, text) {
  return `<div class="empty-state"><div class="ic">${icon(iconName)}</div><p><strong>${escapeHtml(title)}</strong></p><p class="small">${escapeHtml(text)}</p></div>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
