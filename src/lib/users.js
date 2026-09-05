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
// verified à true (nécessite la règle Manage ci-dessus — sans elle, la
// création entière échoue plutôt que d'ignorer juste ce champ, voir
// historique git) : ces comptes sont créés à la main par un admin qui donne
// les identifiants directement, pas un vrai flow d'inscription à confirmer.
export function createUser({ name, email, password, role, apps_autorisees }) {
  return pb.collection('users').create({
    name, email, password, passwordConfirm: password, role, apps_autorisees,
    theme: 'clair', emailVisibility: true, verified: true,
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
