import { userRole } from '../lib/pocketbase.js';
import { listUsers, createUser, updateUser, deleteUser } from '../lib/users.js';
import { icon } from '../lib/icons.js';
import { openDrawer, confirmDrawer } from '../lib/drawer.js';

const ROLE_LABEL = { admin: 'Admin', membre: 'Membre', invite: 'Invité' };
// Wall est toujours accessible et Finances toujours désactivée (décisions
// verrouillées, voir CLAUDE.md) : seules Menus et Stocks sont réellement
// gérées par apps_autorisees, donc les seules proposées ici.
const APPS = [
  { id: 'menus', label: 'Menus' },
  { id: 'stocks', label: 'Stocks' },
];

export async function renderAdminTab(container, currentUser) {
  const canWrite = userRole(currentUser) === 'admin';
  const refresh = () => renderAdminTab(container, currentUser);

  container.innerHTML = '<div class="empty-state small"><p>Chargement…</p></div>';
  try {
    const users = await listUsers();
    renderUserList(container, canWrite, refresh, users, currentUser);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="ic">${icon('alert-triangle')}</div><p><strong>Erreur de chargement</strong></p><p class="small">${escapeHtml(err.message || 'Réessaie dans un instant.')}</p></div>`;
  }
}

function renderUserList(container, canWrite, refresh, users, currentUser) {
  let html = `<div class="section-head">
    <div>
      <div class="section-head-title">Utilisateurs</div>
      <div class="section-head-sub">Comptes du foyer et leurs accès</div>
    </div>
    ${canWrite ? `<div class="section-head-actions"><button class="btn-primary small" data-action="add-user">+ Ajouter un utilisateur</button></div>` : ''}
  </div>`;

  if (!users.length) {
    html += `<div class="empty-state"><div class="ic">${icon('users')}</div><p><strong>Aucun utilisateur</strong></p></div>`;
  } else {
    html += '<div class="panel"><div class="panel-body" style="padding-top:8px;">';
    users.forEach((u) => {
      const apps = (u.apps_autorisees || []).map((id) => APPS.find((a) => a.id === id)?.label || id).join(', ');
      const isSelf = u.id === currentUser.id;
      html += `<div class="row">
        <div>
          <div class="row-text">${escapeHtml(u.name || u.email)}${isSelf ? ' <span class="row-note" style="display:inline">(toi)</span>' : ''}</div>
          <div class="row-note">${escapeHtml(u.email)} · Accès : ${apps ? escapeHtml(apps) : 'aucun'}</div>
        </div>
        <span class="panel-head-actions">
          <span class="badge neutral">${escapeHtml(ROLE_LABEL[u.role] || u.role || '—')}</span>
          ${
            canWrite
              ? `<button class="link-accent" data-action="edit-user" data-id="${u.id}">Modifier</button>${isSelf ? '' : `<button class="link-muted" data-action="delete-user" data-id="${u.id}" data-nom="${escapeHtml(u.name || u.email)}">Supprimer</button>`}`
              : ''
          }
        </span>
      </div>`;
    });
    html += '</div></div>';
  }

  container.innerHTML = html;
  container.onclick = async (e) => {
    if (e.target.closest('[data-action="add-user"]')) {
      dialogUser(null, refresh);
      return;
    }
    const editBtn = e.target.closest('[data-action="edit-user"]');
    if (editBtn) {
      const existing = users.find((u) => u.id === editBtn.dataset.id);
      if (existing) dialogUser(existing, refresh);
      return;
    }
    const delBtn = e.target.closest('[data-action="delete-user"]');
    if (delBtn) {
      const ok = await confirmDrawer(`Supprimer « ${delBtn.dataset.nom} » ?`, 'Ce compte sera définitivement supprimé et ne pourra plus se connecter.');
      if (ok) deleteUser(delBtn.dataset.id).then(refresh).catch((err) => alert(err.message));
    }
  };
}

function dialogUser(existing, onDone) {
  const isNew = !existing;
  const apps = existing?.apps_autorisees || [];
  const appsHtml = APPS.map(
    (a) => `<label class="checkbox-row"><input type="checkbox" name="apps" value="${a.id}"${apps.includes(a.id) ? ' checked' : ''} /> ${a.label}</label>`
  ).join('');

  openDrawer(isNew ? 'Ajouter un utilisateur' : `Modifier · ${existing.name || existing.email}`, `
    <label class="field"><span>Nom</span><input type="text" name="name" required autofocus value="${existing ? escapeHtml(existing.name || '') : ''}" /></label>
    <label class="field"><span>Email</span><input type="email" name="email" required value="${existing ? escapeHtml(existing.email) : ''}" /></label>
    ${
      isNew
        ? `<label class="field"><span>Mot de passe</span><input type="password" name="password" required minlength="8" /></label>`
        : `<label class="field"><span>Nouveau mot de passe</span><input type="password" name="password" minlength="8" placeholder="Laisser vide pour ne pas changer" /></label>`
    }
    <label class="field"><span>Rôle</span>
      <select name="role" required>
        <option value="admin"${existing?.role === 'admin' ? ' selected' : ''}>Admin</option>
        <option value="membre"${!existing || existing.role === 'membre' ? ' selected' : ''}>Membre</option>
        <option value="invite"${existing?.role === 'invite' ? ' selected' : ''}>Invité</option>
      </select>
    </label>
    <fieldset class="field checkbox-field"><legend>Applications ouvertes</legend>${appsHtml}</fieldset>
  `, {
    onSubmit: async (fd) => {
      const name = fd.get('name').trim();
      const email = fd.get('email').trim();
      const role = fd.get('role');
      const apps_autorisees = fd.getAll('apps');
      const password = fd.get('password');
      if (!name || !email) throw new Error('Nom et email sont requis.');
      if (password && password.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');

      if (isNew) {
        if (!password) throw new Error('Le mot de passe est requis.');
        await createUser({ name, email, password, role, apps_autorisees });
      } else {
        const data = { name, email, role, apps_autorisees };
        if (password) { data.password = password; data.passwordConfirm = password; }
        await updateUser(existing.id, data);
      }
      onDone();
    },
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
