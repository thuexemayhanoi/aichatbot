import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Load a JSON data file from the repository (tests run in Node, not the browser). */
export function loadData(relativePath) {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8'));
}

export const business = loadData('data/business/business.json');
export const pricing = loadData('data/business/pricing.json');
export const faq = loadData('data/business/faq.json');
