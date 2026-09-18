import { isValidWord } from './dictionary.js';

export type WordRejectionReason = 'duplicate' | 'rule' | 'dictionary';

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: WordRejectionReason };

// Order matters, per spec: duplicate check, then the letter/length
// rule, then dictionary — cheapest/fastest checks first, dictionary
// (which may hit the network) last.
export async function validateWord(
  word: string,
  requiredLetter: string,
  minLength: number,
  wordsUsedThisRound: string[],
): Promise<ValidationResult> {
  const normalized = word.trim().toLowerCase();

  if (wordsUsedThisRound.includes(normalized)) {
    return { valid: false, reason: 'duplicate' };
  }

  const startsRight = normalized.startsWith(requiredLetter.toLowerCase());
  const longEnough = normalized.length >= minLength;
  if (!startsRight || !longEnough) {
    return { valid: false, reason: 'rule' };
  }

  if (!(await isValidWord(normalized))) {
    return { valid: false, reason: 'dictionary' };
  }

  return { valid: true };
}
