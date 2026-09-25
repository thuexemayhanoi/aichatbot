/**
 * Pure URL/query configuration shared by direct mode and embed iframe mode.
 * Node-testable: parsing works on any URL string.
 */

const SUPPORTED_LANGS = new Set(['vi', 'en']);
const THEMES = new Set(['auto', 'light', 'dark']);
const POSITIONS = new Set(['left', 'right']);

/**
 * @param {string|URLSearchParams} input
 * @returns {{lang:'vi'|'en', theme:'auto'|'light'|'dark', source:string|null, embed:boolean}}
 */
export function parseQueryConfig(input) {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(String(input ?? ''));
  const lang = String(params.get('lang') ?? '').toLowerCase();
  const theme = String(params.get('theme') ?? '').toLowerCase();
  const source = params.get('source');
  return {
    lang: SUPPORTED_LANGS.has(lang) ? lang : 'vi',
    theme: THEMES.has(theme) ? theme : 'auto',
    source: typeof source === 'string' && source.length > 0 ? source.slice(0, 64) : null,
    embed: params.get('embed') === '1'
  };
}

/**
 * Build an iframe URL for the embed widget from a base URL and config.
 * @param {string|URL} baseUrl - e.g. https://host/aichatbot/embed.js
 */
export function buildEmbedUrl(baseUrl, config = {}) {
  if (!baseUrl) throw new TypeError('buildEmbedUrl requires a baseUrl');
  const url = new URL(String(baseUrl), typeof location !== 'undefined' ? location.href : undefined);
  url.pathname = url.pathname.replace(/\/embed\.js$/, '') + '/index.html';
  url.search = '';
  const { lang, theme, source } = config;
  if (lang && SUPPORTED_LANGS.has(lang)) url.searchParams.set('lang', lang);
  if (theme && THEMES.has(theme)) url.searchParams.set('theme', theme);
  if (source) url.searchParams.set('source', String(source).slice(0, 64));
  url.searchParams.set('embed', '1');
  return url.toString();
}

export const EMBED_OPTIONS = { LANGS: SUPPORTED_LANGS, THEMES, POSITIONS };
