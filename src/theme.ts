/** The Markupress plugin sets this as HTMLKit's headScript, which runs before first paint, so a saved theme never shows the default first. */
export const themeScript = `{ let saved = null; try { saved = localStorage.getItem('markupress:theme'); } catch { /* Storage can be disabled. */ }
document.documentElement.dataset.theme = saved === 'dark' || (saved === null && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; }
`;
