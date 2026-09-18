export type DifficultyTier = 'Easy' | 'Medium' | 'Hard';

// Straight from the spec: tier is purely a function of how many letters
// the current turn requires, recomputed fresh every turn.
export function getDifficultyTier(letterCount: number): DifficultyTier {
  if (letterCount <= 5) return 'Easy';
  if (letterCount <= 8) return 'Medium';
  return 'Hard';
}

export interface TurnDifficulty {
  minLength: number;
  timeLimitSeconds: number;
}

const STARTING_MIN_LENGTH = 3;
const STARTING_TIME_LIMIT = 45;
const MAX_MIN_LENGTH = 10;
// While letters are still climbing toward MAX_MIN_LENGTH, time never
// drops below this. Only once letters are capped does time keep falling.
const PRE_CAP_TIME_FLOOR = 20;
const MIN_TIME_LIMIT = 5;
const TURNS_PER_ESCALATION = 2;

// The escalation level at which letters first hit MAX_MIN_LENGTH —
// e.g. starting at 3, capping at 10, that's 7 levels of +1 each.
const CAP_LEVEL = MAX_MIN_LENGTH - STARTING_MIN_LENGTH;

// turnNumber starts at 1. Every 2 turns, min length climbs by 1 (capped
// at 10) while time drops by 5s but holds at 20 until letters cap out —
// after that, time resumes falling every 2 turns down to a 5s floor.
export function getDifficultyForTurn(turnNumber: number): TurnDifficulty {
  const level = Math.floor((turnNumber - 1) / TURNS_PER_ESCALATION);

  const minLength = Math.min(STARTING_MIN_LENGTH + level, MAX_MIN_LENGTH);

  const timeLimitSeconds =
    level <= CAP_LEVEL
      ? Math.max(STARTING_TIME_LIMIT - level * 5, PRE_CAP_TIME_FLOOR)
      : Math.max(
          PRE_CAP_TIME_FLOOR - (level - CAP_LEVEL) * 5,
          MIN_TIME_LIMIT,
        );

  return { minLength, timeLimitSeconds };
}
