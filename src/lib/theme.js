// Toujours poser data-theme explicitement (jamais laisser l'attribut absent) :
// tokens.css a un repli @media(prefers-color-scheme: dark), et l'app ne doit
// jamais suivre le thème système en silence (décision verrouillée, CLAUDE.md).
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'sombre' ? 'dark' : 'light');
}

export function currentThemeAttr() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'sombre' : 'clair';
}
