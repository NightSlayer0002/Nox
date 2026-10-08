// The owner explicitly chose always-on NOX animation, including when the
// browser requests reduced motion. No system/browser setting is modified.
export function readMotionPreference(){return true;}
export function readTheme(storage){try{return (storage||globalThis.localStorage).getItem('nox.theme.v2')==='light'?'light':'dark';}catch{return 'dark';}}
export function saveTheme(value,storage){const theme=value==='light'?'light':'dark';try{(storage||globalThis.localStorage).setItem('nox.theme.v2',theme);}catch{}return theme;}
export function applyTheme(theme){document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#101915':'#f5f3ec');}
