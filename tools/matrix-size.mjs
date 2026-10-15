/**
 * Size of data/blog/content-matrix.csv.
 *
 * The 2,000-row production matrix (BA-0001 … BA-2000) is frozen: never
 * regenerated, reordered or trimmed. Rows after it are SEO additions decided
 * from measured demand (docs/seo/battle/09-url-architecture.md: engine-06
 * proposals the owner accepted), appended with the next BA id and the same
 * columns, and published through the same factory. Every size guard reads
 * these constants so adding a row is one deliberate change here plus the row.
 */
export const FOUNDATION_ROWS = 2000;
/** BA-2001 … : SEO rows appended after the foundation (battle matrix, 15/10/2026). */
export const SEO_ROWS = 4;
export const MATRIX_ROWS = FOUNDATION_ROWS + SEO_ROWS;
