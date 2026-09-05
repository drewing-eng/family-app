import { refreshSession } from '../lib/pocketbase.js';
import { updateMyInfo, changeMyPassword } from '../lib/users.js';

// opts.onUpdated : appelé après un enregistrement réussi pour que shell.js
// resynchronise l'avatar/le nom affichés dans la sidebar (le profil rendu au
// montage du shell ne se met pas à jour tout seul).
export function renderAccountTab(container, user, opts = {}) {
  container.innerHTML = `
    <p class="row-note" style="margin-bottom:8px;">Tes informations de connexion.</p>

    <div class="section-eyebrow">Informations</div>
    <div class="panel"><div class="panel-body">
      <form id="accountInfoForm" class="account-form">
        <label class="field"><span>Nom</span><input type="text" name="name" required value="${escapeHtml(user.name || '')}" /></label>
        <label class="field"><span>Email</span><input type="email" name="email" required value="${escapeHtml(user.email)}" /></label>
        <p class="drawer-error" id="accountInfoError" hidden></p>
        <button type="submit" class="btn-primary small">Enregistrer</button>
      </form>
    </div></div>

    <div class="section-eyebrow">Mot de passe</div>
    <div class="panel"><div class="panel-body">
      <form id="accountPasswordForm" class="account-form">
        <label class="field"><span>Mot de passe actuel</span><input type="password" name="oldPassword" required autocomplete="current-password" /></label>
        <label class="field"><span>Nouveau mot de passe</span><input type="password" name="password" required minlength="8" autocomplete="new-password" /></label>
        <p class="drawer-error" id="accountPasswordError" hidden></p>
        <button type="submit" class="btn-primary small">Changer le mot de passe</button>
      </form>
    </div></div>
  `;

  const infoForm = container.querySelector('#accountInfoForm');
  const infoError = container.querySelector('#accountInfoError');
  infoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    infoError.hidden = true;
    const fd = new FormData(infoForm);
    const submitBtn = infoForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await updateMyInfo(user.id, { name: fd.get('name').trim(), email: fd.get('email').trim() });
      await refreshSession();
      opts.onUpdated?.();
    } catch (err) {
      infoError.textContent = err.message || 'Une erreur est survenue.';
      infoError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  const pwForm = container.querySelector('#accountPasswordForm');
  const pwError = container.querySelector('#accountPasswordError');
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pwError.hidden = true;
    const fd = new FormData(pwForm);
    const submitBtn = pwForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await changeMyPassword(user.id, fd.get('oldPassword'), fd.get('password'));
      pwForm.reset();
    } catch (err) {
      pwError.textContent = err.message || 'Une erreur est survenue.';
      pwError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
