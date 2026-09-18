import { readFileSync } from 'node:fs';
import wordListPath from 'word-list';
import { logger } from '../utils/logger.js';

// word-list's default export is just a path to a newline-separated word
// list file — read once at startup and kept in a Set for instant O(1)
// lookups on every turn, instead of re-reading/re-scanning the file.
const localWords = new Set(readFileSync(wordListPath, 'utf8').split('\n'));

export function isInLocalDictionary(word: string): boolean {
  return localWords.has(word.toLowerCase());
}

async function isInExternalDictionary(word: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
    );
    if (!response.ok) return false;

    // Response is keyed by language code (e.g. "en", "fr", "de") — only
    // count it as valid if it actually has an English entry, so a
    // word that's only defined in another language isn't accepted
    const data = (await response.json()) as Record<string, unknown>;
    return 'en' in data;
  } catch (error) {
    // Network failure/timeout — treated as "not found" rather than
    // stalling or incorrectly accepting an unverifiable word
    logger.error({ error, word }, 'Dictionary API check failed');
    return false;
  }
}

// Local list first (fast, no network dependency); falls back to the
// API only for words the local list is missing, per the spec's hybrid
// strategy — avoids both an API-only design's latency/outage risk on
// every turn, and a local-only design's false rejections.
export async function isValidWord(word: string): Promise<boolean> {
  if (isInLocalDictionary(word)) return true;
  return isInExternalDictionary(word);
}
