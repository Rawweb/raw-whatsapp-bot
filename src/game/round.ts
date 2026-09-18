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
// shuffle happens again once the round starts. Also resets every
// per-round counter — for a standalone game this is a no-op (there's
// only ever one round), but a session's round 2+ genuinely needs a
// fresh wordsUsedThisRound/totalWordsThisRound/longestWord, per spec:
// none of that carries over between a session's rounds.
export async function startRound(
  groupId: string,
  roundNumber: number,
  players: string[],
): Promise<void> {
  const shuffledPlayers = shuffle(players);
  const letterSequence = shuffle(LETTERS.split(''));

  await Group.updateOne(
    { groupId },
    {
      $set: {
        'activeGame.currentRound': roundNumber,
        'activeGame.playerQueue': shuffledPlayers,
        'activeGame.currentTurnIndex': 0,
        'activeGame.turnNumber': 1,
        'activeGame.letterSequence': letterSequence,
        'activeGame.eliminated': [],
        'activeGame.wordsUsedThisRound': [],
        'activeGame.totalWordsThisRound': 0,
        'activeGame.longestWord': { word: '', length: 0, userId: '' },
      },
    },
  );
}
