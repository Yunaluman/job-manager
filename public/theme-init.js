// Same-origin, blocking bootstrap applies the theme before the first paint.
(() => {
  const media = matchMedia('(prefers-color-scheme: dark)')
  let preference = 'system'
  const read = () => {
    try { preference = localStorage.getItem('jobpilot.theme') || 'system' } catch {}
    if (!['system', 'light', 'dark'].includes(preference)) preference = 'system'
  }
  const apply = () => {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }
  read(); apply()
  media.addEventListener('change', apply)
  window.addEventListener('jobpilot-theme-change', (event) => { preference = event.detail; apply() })
  window.addEventListener('storage', (event) => { if (event.key === 'jobpilot.theme') { read(); apply() } })
})()
