import { icon } from './icons.js';

// Tiroir générique (remplace le <dialog> centré) : une carte qui glisse
// depuis le bas en bottom-sheet sur mobile (par-dessus le contenu, scrim
// cliquable pour fermer) et qui pousse le contenu depuis la droite sur
// desktop (largeur animée, pas de scrim) — voir design-systeme.md et la
// maquette de référence qu'il cite. Le balisage (#drawer/#scrim/#drawerTitle/
// #drawerBody) est posé une seule fois par shell.js dans le gabarit de
// l'app-shell ; ce module ne fait que le remplir/vider et gérer la classe
// .open, jamais de logique différente par device (une seule media query CSS
// s'en charge, voir global.css).

function els() {
  return {
    drawer: document.getElementById('drawer'),
    scrim: document.getElementById('scrim'),
    titleEl: document.getElementById('drawerTitle'),
    body: document.getElementById('drawerBody'),
  };
}

// Appelé une fois par shell.js après le montage du gabarit : câble la croix
// de fermeture et le scrim (clic en dehors, pertinent seulement en
// bottom-sheet mobile puisque le desktop ne pousse jamais de scrim).
export function initDrawer() {
  const { scrim } = els();
  document.getElementById('drawerClose').addEventListener('click', () => closeDrawer());
  scrim.addEventListener('click', () => closeDrawer());
}

export function closeDrawer() {
  const { drawer, scrim } = els();
  drawer.classList.remove('open');
  scrim.hidden = true;
}

function openRaw(title, fill) {
  const { drawer, scrim, titleEl, body } = els();
  titleEl.textContent = title;
  body.innerHTML = '';
  fill(body);
  drawer.classList.add('open');
  scrim.hidden = false;
}

// Formulaire (ajout/édition) : bodyHtml ne fournit que les champs, le
// tiroir ajoute lui-même la zone d'erreur et les actions Annuler/Enregistrer.
export function openDrawer(title, bodyHtml, { onSubmit, submitLabel = 'Enregistrer' } = {}) {
  openRaw(title, (body) => {
    body.innerHTML = `
      <form>
        ${bodyHtml}
        <p class="drawer-error" hidden></p>
        <div class="drawer-actions">
          <button type="button" class="btn-ghost" data-close>Annuler</button>
          <button type="submit" class="btn-primary">${escapeHtml(submitLabel)}</button>
        </div>
      </form>`;

    const form = body.querySelector('form');
    const errorEl = body.querySelector('.drawer-error');
    body.querySelector('[data-close]').addEventListener('click', () => closeDrawer());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await onSubmit(new FormData(form));
        closeDrawer();
      } catch (err) {
        errorEl.textContent = err.message || 'Une erreur est survenue.';
        errorEl.hidden = false;
        submitBtn.disabled = false;
      }
    });

    // `autofocus` n'est pas garanti sur du HTML injecté via innerHTML selon
    // les navigateurs : on le déclenche nous-mêmes pour rester fiable.
    const first = form.querySelector('[autofocus]');
    if (first) first.focus();
  });
}

// Remplace confirm() natif : icône d'alerte centrée + message contextuel
// (ce qui sera réellement supprimé) — cf. design-systeme.md § Composants.
// Résout à true/false.
export function confirmDrawer(title, message, { confirmLabel = 'Supprimer' } = {}) {
  return new Promise((resolve) => {
    openRaw(title, (body) => {
      body.innerHTML = `
        <div class="drawer-confirm">
          <div class="confirm-icon">${icon('alert-triangle')}</div>
          <p class="drawer-sub">${escapeHtml(message)}</p>
          <div class="drawer-actions drawer-actions-center">
            <button type="button" class="btn-ghost" data-cancel>Annuler</button>
            <button type="button" class="btn-danger" data-confirm>${escapeHtml(confirmLabel)}</button>
          </div>
        </div>`;
      const finish = (result) => { closeDrawer(); resolve(result); };
      body.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
      body.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
    });
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
