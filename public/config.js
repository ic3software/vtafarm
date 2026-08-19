// Runtime configuration. In a container the image's entrypoint overwrites this
// file from $API_URL, so one image serves every deployment. `pnpm dev` serves
// it as shipped and the app falls back to VITE_API_URL from .env.
window.__VTAFARM_CONFIG__ = { apiUrl: '' }
