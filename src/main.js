import { isLoggedIn } from './lib/pocketbase.js';

// Placeholder du chantier 1 (fondations) : valide que la chaîne Vite → CSS → PocketBase
// fonctionne de bout en bout. La coquille applicative (sidebar/wall, auth réelle,
// mode sombre par profil) est le chantier 2 — volontairement pas construite ici.
document.getElementById('app').innerHTML = `
  <main style="max-width: 480px; margin: 15vh auto 0; padding: 0 24px; text-align: center;">
    <h1 style="font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; color: var(--accent); margin-bottom: 8px;">
      GAUTIER Family
    </h1>
    <p style="color: var(--text-muted); font-size: 0.92rem;">
      Chantier 1 — fondations posées. Coquille applicative à venir (chantier 2).
    </p>
    <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 18px;">
      PocketBase : ${isLoggedIn() ? 'session active' : 'non connecté'}
    </p>
  </main>
`;
