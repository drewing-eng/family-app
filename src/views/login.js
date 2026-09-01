import { login } from '../lib/pocketbase.js';

export function renderLogin(container, { onSuccess }) {
  container.innerHTML = `
    <div class="login-screen">
      <form class="login-card" id="loginForm" novalidate>
        <div class="login-brand">GAUTIER Family</div>
        <p class="login-tag">Connexion au foyer</p>
        <label class="field">
          <span>Email</span>
          <input type="email" name="email" required autocomplete="username" autofocus />
        </label>
        <label class="field">
          <span>Mot de passe</span>
          <input type="password" name="password" required autocomplete="current-password" />
        </label>
        <p class="login-error" id="loginError" hidden></p>
        <button type="submit" class="btn-primary">Se connecter</button>
      </form>
    </div>
  `;

  const form = container.querySelector('#loginForm');
  const errorEl = container.querySelector('#loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const submitBtn = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Connexion…';
    try {
      await login(fd.get('email'), fd.get('password'));
      onSuccess();
    } catch {
      errorEl.textContent = 'Email ou mot de passe incorrect.';
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Se connecter';
    }
  });
}
