import { pb, refreshSession, userTheme, onAuthChange } from './lib/pocketbase.js';
import { applyTheme } from './lib/theme.js';
import { renderLogin } from './views/login.js';
import { renderShell } from './views/shell.js';

const app = document.getElementById('app');

// Toujours clair par défaut tant qu'on ne connaît pas encore le profil —
// jamais suivre le thème système en silence (décision verrouillée).
applyTheme('clair');

async function boot() {
  await refreshSession();
  const user = pb.authStore.record;
  applyTheme(user ? userTheme(user) : 'clair');

  if (user) {
    renderShell(app);
  } else {
    renderLogin(app, {
      onSuccess: () => {
        applyTheme(userTheme(pb.authStore.record));
        renderShell(app);
      },
    });
  }
}

// Si le compte est supprimé/désactivé pendant la session, retombe sur le login.
onAuthChange((user) => {
  if (!user && app.querySelector('.app-shell')) boot();
});

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
