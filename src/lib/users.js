import { pb } from './pocketbase.js';

// ── Module Admin : gestion des comptes (liste/création/modification/suppression) ──
// Règles d'API PocketBase requises sur la collection `users` (à poser par le
// superadmin, voir CLAUDE.md) :
// - List/View : @request.auth.role = "admin" || @request.auth.role = "membre"
// - Create    : @request.auth.role = "admin"
// - Update    : @request.auth.role = "admin" || id = @request.auth.id   (soi-même, pour Mon compte)
// - Delete    : @request.auth.role = "admin"

export function listUsers() {
  return pb.collection('users').getFullList({ sort: 'name' });
}

// theme/apps_autorisees n'ont pas de valeur par défaut côté PocketBase (voir
// CLAUDE.md) : on pose "clair" ici pour ne pas laisser un compte fraîchement
// créé sans thème. emailVisibility à true pour que l'email soit visible dans
// la liste par les autres admins/membres (PocketBase le masque sinon).
//
// Pas de `verified: true` ici : c'est un champ protégé, et l'envoyer sans la
// règle Manage posée côté PocketBase ne se contente pas d'être ignoré comme
// pour un champ inconnu — ça fait échouer la création entière ("Failed to
// create record."), constaté en conditions réelles. Retiré pour fiabiliser
// la création ; à réintroduire uniquement une fois la règle Manage confirmée
// active (voir CLAUDE.md).
export function createUser({ name, email, password, role, apps_autorisees }) {
  return pb.collection('users').create({
    name, email, password, passwordConfirm: password, role, apps_autorisees,
    theme: 'clair', emailVisibility: true,
  });
}

// `data` peut inclure password/passwordConfirm (changement de mot de passe
// par un admin, sans oldPassword requis puisque ce n'est pas un self-update).
export function updateUser(id, data) {
  return pb.collection('users').update(id, data);
}

export function deleteUser(id) {
  return pb.collection('users').delete(id);
}

// ── Mon compte : l'utilisateur connecté modifie ses propres informations ──
export function updateMyInfo(id, { name, email }) {
  return pb.collection('users').update(id, { name, email });
}

// oldPassword est requis par PocketBase pour un changement de mot de passe
// en self-update (contrairement à updateUser ci-dessus, utilisé par un admin
// sur un autre compte).
export function changeMyPassword(id, oldPassword, password) {
  return pb.collection('users').update(id, { oldPassword, password, passwordConfirm: password });
}
