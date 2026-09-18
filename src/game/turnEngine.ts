import crypto from 'node:crypto';
import type { WASocket, WAMessageKey } from '@whiskeysockets/baileys';
import { Group } from '../models/Group.js';
import { getDifficultyForAnswerCount, getDifficultyTier } from './difficulty.js';
import { validateWord } from './wordValidation.js';
import {
  turnStatus,
  wordRejected,
  timeoutElimination,
  roundWinStandalone,
} from '../config/messages.js';
import { logger } from '../utils/logger.js';

// Turn N's required letter is just this round's shuffled sequence at
// position N-1, cycling back to the start if a round runs past 26 turns
function getLetterForTurn(letterSequence: string[], turnNumber: number): string {
  return letterSequence[(turnNumber - 1) % letterSequence.length];
}

// Finds the next player after `fromIndex` in the fixed queue who isn't
// eliminated, wrapping around. The queue itself never gets reordered —
// only skipped over — per spec's "shuffled once, not re-randomized".
function findNextActiveIndex(
  playerQueue: string[],
  eliminated: string[],
  fromIndex: number,
): number {
  const total = playerQueue.length;
  for (let step = 1; step <= total; step++) {
    const index = (fromIndex + step) % total;
    if (!eliminated.includes(playerQueue[index])) return index;
  }
  return fromIndex;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// Kicks off the very first turn of a round — called once, right after
// startRound() has set up a fresh playerQueue/currentTurnIndex/letterSequence.
export async function beginRound(
  socket: WASocket,
  groupId: string,
): Promise<void> {
  await Group.updateOne(
    { groupId },
    { $set: { 'activeGame.roundStartedAt': new Date() } },
  );
  await beginTurn(socket, groupId);
}

// Posts the status for whoever is currently at activeGame.currentTurnIndex
// and schedules that turn's timeout. Called at round start and again
// after every turn that doesn't end the round.
async function beginTurn(socket: WASocket, groupId: string): Promise<void> {
  const group = await Group.findOne({ groupId });
  if (!group || !group.activeGame.isActive) return; // e.g. .raw end fired

  const {
    playerQueue,
    eliminated,
    currentTurnIndex,
    letterSequence,
    turnNumber,
    totalWordsThisRound,
  } = group.activeGame;

  const currentPlayer = playerQueue[currentTurnIndex];
  const nextIndex = findNextActiveIndex(
    playerQueue,
    eliminated,
    currentTurnIndex,
  );
  const nextPlayer = playerQueue[nextIndex];
  const letter = getLetterForTurn(letterSequence, turnNumber);

  const turnToken = crypto.randomUUID();
  const { minLength, timeLimitSeconds } =
    getDifficultyForAnswerCount(totalWordsThisRound);
  const tier = getDifficultyTier(minLength);
  const playersRemaining = playerQueue.length - eliminated.length;

  await Group.updateOne(
    { groupId },
    {
      $set: {
        'activeGame.turnToken': turnToken,
        'activeGame.turnResolved': false,
      },
    },
  );

  await socket.sendMessage(groupId, {
    text: turnStatus({
      currentPlayer,
      nextPlayer,
      letter,
      minLength,
      tier,
      playersRemaining,
      totalPlayers: playerQueue.length,
      timeLimitSeconds,
      totalWords: totalWordsThisRound,
    }),
    mentions: [
      `${currentPlayer}@s.whatsapp.net`,
      `${nextPlayer}@s.whatsapp.net`,
    ],
  });

  setTimeout(() => {
    handleTimeout(socket, groupId, turnToken).catch((error) => {
      logger.error({ error }, 'Error handling turn timeout');
    });
  }, timeLimitSeconds * 1000);
}

// Called for every plain-text message while a round is in progress.
// Silently does nothing unless the sender is actually the current
// player — everyone else's messages during gameplay are just chat.
// msgKey identifies the sender's actual message, so an accepted word
// can get a ✅ reaction on it.
export async function handleWordSubmission(
  socket: WASocket,
  groupId: string,
  senderNumber: string,
  rawWord: string,
  msgKey: WAMessageKey,
): Promise<void> {
  const group = await Group.findOne({ groupId });
  if (!group || !group.activeGame.isActive) return;
  if (group.activeGame.phase !== 'in_progress') return;

  const {
    playerQueue,
    currentTurnIndex,
    letterSequence,
    turnNumber,
    wordsUsedThisRound,
    totalWordsThisRound,
  } = group.activeGame;
  const currentPlayer = playerQueue[currentTurnIndex];
  if (senderNumber !== currentPlayer) return;

  const letter = getLetterForTurn(letterSequence, turnNumber);
  const { minLength } = getDifficultyForAnswerCount(totalWordsThisRound);
  const word = rawWord.trim().toLowerCase();

  const validation = await validateWord(
    word,
    letter,
    minLength,
    wordsUsedThisRound,
  );

  if (!validation.valid) {
    await socket.sendMessage(groupId, {
      text: wordRejected(validation.reason, word, letter, minLength, senderNumber),
      mentions: [`${senderNumber}@s.whatsapp.net`],
    });
    return;
  }

  // Atomic claim: only succeeds if this exact turn is still unresolved.
  // A timeout that fired at nearly the same instant, or a stray repeat
  // message after already answering, will find this already flipped
  // and simply do nothing — see the Group.ts comment on turnResolved.
  const claim = await Group.updateOne(
    {
      groupId,
      'activeGame.turnToken': group.activeGame.turnToken,
      'activeGame.turnResolved': false,
    },
    {
      $set: { 'activeGame.turnResolved': true },
      $push: { 'activeGame.wordsUsedThisRound': word },
      $inc: { 'activeGame.totalWordsThisRound': 1 },
    },
  );

  if (claim.modifiedCount === 0) return;

  await socket.sendMessage(groupId, { react: { text: '✅', key: msgKey } });

  await maybeUpdateLongestWord(groupId, word, senderNumber);
  await advanceAfterCorrectAnswer(socket, groupId);
}

async function maybeUpdateLongestWord(
  groupId: string,
  word: string,
  userId: string,
): Promise<void> {
  await Group.updateOne(
    { groupId, 'activeGame.longestWord.length': { $lt: word.length } },
    {
      $set: {
        'activeGame.longestWord': { word, length: word.length, userId },
      },
    },
  );
}

async function advanceAfterCorrectAnswer(
  socket: WASocket,
  groupId: string,
): Promise<void> {
  const group = await Group.findOne({ groupId });
  if (!group) return;

  const { playerQueue, eliminated, currentTurnIndex, turnNumber } =
    group.activeGame;
  const nextIndex = findNextActiveIndex(playerQueue, eliminated, currentTurnIndex);

  await Group.updateOne(
    { groupId },
    {
      $set: {
        'activeGame.currentTurnIndex': nextIndex,
        'activeGame.turnNumber': turnNumber + 1,
      },
    },
  );

  await beginTurn(socket, groupId);
}

async function handleTimeout(
  socket: WASocket,
  groupId: string,
  turnToken: string,
): Promise<void> {
  const claim = await Group.updateOne(
    { groupId, 'activeGame.turnToken': turnToken, 'activeGame.turnResolved': false },
    { $set: { 'activeGame.turnResolved': true } },
  );
  if (claim.modifiedCount === 0) return; // answered correctly just in time

  const group = await Group.findOne({ groupId });
  if (!group) return;

  const { playerQueue, currentTurnIndex, eliminated, turnNumber } =
    group.activeGame;
  const eliminatedPlayer = playerQueue[currentTurnIndex];

  await socket.sendMessage(groupId, {
    text: timeoutElimination(eliminatedPlayer),
    mentions: [`${eliminatedPlayer}@s.whatsapp.net`],
  });

  const newEliminated = [...eliminated, eliminatedPlayer];
  const remaining = playerQueue.length - newEliminated.length;

  if (remaining <= 1) {
    await endRoundWithWinner(socket, groupId, newEliminated);
    return;
  }

  const nextIndex = findNextActiveIndex(
    playerQueue,
    newEliminated,
    currentTurnIndex,
  );

  await Group.updateOne(
    { groupId },
    {
      $set: {
        'activeGame.eliminated': newEliminated,
        'activeGame.currentTurnIndex': nextIndex,
        'activeGame.turnNumber': turnNumber + 1,
      },
    },
  );

  await beginTurn(socket, groupId);
}

async function endRoundWithWinner(
  socket: WASocket,
  groupId: string,
  finalEliminated: string[],
): Promise<void> {
  const group = await Group.findOne({ groupId });
  if (!group) return;

  const { playerQueue, totalWordsThisRound, longestWord, roundStartedAt } =
    group.activeGame;
  const winner = playerQueue.find((p) => !finalEliminated.includes(p));
  if (!winner) return;

  const elapsed = formatElapsed(Date.now() - roundStartedAt.getTime());

  // Only mention the longest-word holder if a word was actually accepted
  // this round — an empty userId would otherwise become a malformed JID
  const mentions = longestWord.userId
    ? [`${winner}@s.whatsapp.net`, `${longestWord.userId}@s.whatsapp.net`]
    : [`${winner}@s.whatsapp.net`];

  await socket.sendMessage(groupId, {
    text: roundWinStandalone({
      winner,
      totalWords: totalWordsThisRound,
      longestWord: longestWord.word,
      longestWordLength: longestWord.length,
      longestWordBy: longestWord.userId,
      elapsed,
    }),
    mentions,
  });

  await Group.updateOne(
    { groupId },
    {
      $set: {
        'activeGame.isActive': false,
        'activeGame.phase': 'lobby',
        'activeGame.eliminated': finalEliminated,
      },
    },
  );
}

export { findNextActiveIndex, formatElapsed, getLetterForTurn };
