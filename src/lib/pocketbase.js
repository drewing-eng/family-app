import PocketBase from 'pocketbase';

// En prod (Docker), window.__POCKETBASE_URL__ vient de /config.js, généré par
// server.js à partir de la variable d'environnement POCKETBASE_URL — modifiable
// sans reconstruire l'image. En dev (`npm run dev`), on retombe sur .env (Vite).
const url =
  (typeof window !== 'undefined' && window.__POCKETBASE_URL__) ||
  import.meta.env.VITE_POCKETBASE_URL ||
  'http://127.0.0.1:8090';

export const pb = new PocketBase(url);

export function currentUser() {
  return pb.authStore.record;
}

export function isLoggedIn() {
  return pb.authStore.isValid;
}

export function login(email, password) {
  return pb.collection('users').authWithPassword(email, password);
}

export function logout() {
  pb.authStore.clear();
}

// callback(user) appelé immédiatement avec l'état courant, puis à chaque changement
export function onAuthChange(callback) {
  return pb.authStore.onChange(() => callback(pb.authStore.record), true);
}
