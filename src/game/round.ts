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

// Shuffles the lobby's joined players into a fixed turn order, and
// separately shuffles the 26 letters into this round's letter sequence
// (turn N's required letter is just sequence[(N-1) % 26] — see
// turnEngine.ts, which actually posts and runs each turn). Neither
// shuffle happens again once the round starts.
export async function startRound(
  groupId: string,
  players: string[],
): Promise<void> {
  const shuffledPlayers = shuffle(players);
  const letterSequence = shuffle(LETTERS.split(''));

  await Group.updateOne(
    { groupId },
    {
      $set: {
        'activeGame.playerQueue': shuffledPlayers,
        'activeGame.currentTurnIndex': 0,
        'activeGame.turnNumber': 1,
        'activeGame.letterSequence': letterSequence,
        'activeGame.eliminated': [],
      },
    },
  );
}
