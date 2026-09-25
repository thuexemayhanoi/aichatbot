/**
 * Local-AI user preference key. Kept in its own module so both the browser
 * entry and Node tests import the exact same key (no drift).
 */
export const ENABLE_STORAGE_KEY = 'motoai:local-ai:enabled';
export const SCOPE_STORAGE_PREFIX = 'motoai:embed:';
