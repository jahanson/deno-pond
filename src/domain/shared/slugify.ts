/**
 * Creates a URL-safe slug from input text with Unicode support.
 *
 * Features:
 * - Unicode-aware letter/number preservation using \p{Letter} and \p{Number}
 * - Accent/diacritic removal via NFD normalization
 * - Optional locale-specific lowercase conversion
 * - Proper separator collapsing and edge trimming
 *
 * @param input - The text to slugify
 * @param locale - Optional locale for case conversion (e.g., 'tr' for Turkish)
 * @returns URL-safe slug string
 */
export function slugify(input: string, locale?: string): string {
  const lower = locale ? input.toLocaleLowerCase(locale) : input.toLowerCase();
  const base = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
  return base
    .replace(/[^\p{Letter}\p{Number}\s\-_]+/gu, "") // keep letters/numbers/spaces/hyphens/underscores (Unicode-aware)
    .replace(/[\s_-]+/g, "-") // collapse separators (including underscores to hyphens)
    .replace(/^-+|-+$/g, ""); // trim edges
}
