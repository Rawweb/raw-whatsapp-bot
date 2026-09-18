import { Group } from '../models/Group.js';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

// Fisher-Yates shuffle — picks a uniformly random permutation, unlike
// naively sorting by Math.random() which is both slower and biased.
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Shuffles the lobby's joined players into a fixed turn order (once —
// never re-shuffled again this round, per spec) and sets up turn 1 with
// a random starting letter. Every turn after this one instead uses the
// last letter of the previous accepted word (chain style) — see
// turnEngine.ts, which actually posts and runs each turn.
export async function startRound(
  groupId: string,
  players: string[],
): Promise<void> {
  const shuffled = shuffle(players);
  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];

  await Group.updateOne(
    { groupId },
    {
      $set: {
        'activeGame.playerQueue': shuffled,
        'activeGame.currentTurnIndex': 0,
        'activeGame.turnNumber': 1,
        'activeGame.currentLetter': letter,
        'activeGame.eliminated': [],
      },
    },
  );
}
