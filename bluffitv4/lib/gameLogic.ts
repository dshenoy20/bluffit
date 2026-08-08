import {
  MAX_ANSWER_LENGTH,
  REAL_ANSWER_ID,
  type Player,
  type RevealItem,
  type Submission,
  type Vote,
  type VotingOption,
} from "./types";

/** Normalize an answer for duplicate comparison: trim, collapse whitespace, lowercase, strip trailing punctuation. */
export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/^[\s"'.]+|[\s"'.!?]+$/g, "");
}

export type AnswerValidation =
  | { ok: true; cleaned: string }
  | { ok: false; reason: string };

/**
 * Validate a submitted answer against the real answer and other players' submissions.
 * Blank answers are allowed only via timer expiry (handled by caller), not manual submit.
 */
export function validateAnswer(
  text: string,
  realAnswer: string,
  existingAnswers: string[]
): AnswerValidation {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) {
    return { ok: false, reason: "Please enter an answer." };
  }
  if (cleaned.length > MAX_ANSWER_LENGTH) {
    return { ok: false, reason: `Keep it under ${MAX_ANSWER_LENGTH} characters.` };
  }
  const norm = normalizeAnswer(cleaned);
  if (norm === normalizeAnswer(realAnswer)) {
    return {
      ok: false,
      reason: "Too close to the real answer! Try a different bluff.",
    };
  }
  if (existingAnswers.some((a) => normalizeAnswer(a) === norm)) {
    return {
      ok: false,
      reason: "Another player already wrote that. Try a different bluff.",
    };
  }
  return { ok: true, cleaned };
}

/** Fisher-Yates shuffle (non-mutating). */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build the shuffled voting options for a round.
 * Blank submissions are excluded (they can't be voted on).
 */
export function buildVotingOptions(
  submissions: Submission[],
  realAnswer: string,
  random: () => number = Math.random
): VotingOption[] {
  const fakes: VotingOption[] = submissions
    .filter((s) => s.answer.trim().length > 0)
    .map((s) => ({ id: s.playerId, text: s.answer.trim() }));
  const real: VotingOption = { id: REAL_ANSWER_ID, text: realAnswer };
  return shuffle([...fakes, real], random);
}

export const POINTS_CORRECT = 1000;
export const POINTS_PER_FOOL = 500;

export interface RoundScoring {
  /** playerId -> points earned this round */
  pointsByPlayer: Record<string, number>;
  revealOrder: RevealItem[];
}

/**
 * Score a round and build the reveal order.
 * +1000 to each player who voted for the real answer.
 * +500 to a bluff's author per player fooled by it.
 * Fake answers are revealed first (fewest votes first, ties stable), the real answer last.
 */
export function scoreRound(
  options: VotingOption[],
  votes: Vote[],
  players: Pick<Player, "id" | "name">[]
): RoundScoring {
  const nameOf = (id: string) =>
    players.find((p) => p.id === id)?.name ?? "Unknown";
  const pointsByPlayer: Record<string, number> = {};
  const add = (playerId: string, pts: number) => {
    pointsByPlayer[playerId] = (pointsByPlayer[playerId] ?? 0) + pts;
  };

  const votesFor = (optionId: string) =>
    votes.filter((v) => v.optionId === optionId);

  const items: RevealItem[] = options.map((opt) => {
    const optVotes = votesFor(opt.id);
    const voterNames = optVotes.map((v) => nameOf(v.playerId));
    if (opt.id === REAL_ANSWER_ID) {
      for (const v of optVotes) add(v.playerId, POINTS_CORRECT);
      return {
        optionId: opt.id,
        text: opt.text,
        authorName: "The real answer",
        voterNames,
        pointsEarned: 0,
        isReal: true,
      };
    }
    const pts = optVotes.length * POINTS_PER_FOOL;
    if (pts > 0) add(opt.id, pts);
    return {
      optionId: opt.id,
      text: opt.text,
      authorName: nameOf(opt.id),
      voterNames,
      pointsEarned: pts,
      isReal: false,
    };
  });

  const fakes = items
    .filter((i) => !i.isReal)
    .sort((a, b) => a.voterNames.length - b.voterNames.length);
  const real = items.filter((i) => i.isReal);
  return { pointsByPlayer, revealOrder: [...fakes, ...real] };
}

/* ---------- personal round result (shown between voting and the leaderboard) ---------- */

export interface PersonalResult {
  kind: "correct" | "fooled" | "no_vote";
  /** Name of the bluff's author, when kind === "fooled". */
  fooledBy: string | null;
  realAnswer: string;
  /** How many players picked the real answer this round. */
  correctCount: number;
  /** Votes my own bluff received. */
  bluffVotes: number;
  bluffPoints: number;
  votePoints: number;
  totalPoints: number;
}

/** Derive one player's result for the round from the scored reveal data. */
export function buildPersonalResult(
  revealOrder: RevealItem[],
  votes: Vote[],
  uid: string
): PersonalResult {
  const realItem = revealOrder.find((i) => i.isReal);
  const myVote = votes.find((v) => v.playerId === uid);
  const votedItem = myVote
    ? revealOrder.find((i) => i.optionId === myVote.optionId)
    : undefined;
  const myBluff = revealOrder.find((i) => i.optionId === uid);

  const bluffVotes = myBluff?.voterNames.length ?? 0;
  const bluffPoints = myBluff?.pointsEarned ?? 0;
  const correct = !!votedItem?.isReal;
  const votePoints = correct ? POINTS_CORRECT : 0;

  return {
    kind: !myVote ? "no_vote" : correct ? "correct" : "fooled",
    fooledBy: myVote && !correct ? (votedItem?.authorName ?? "another player") : null,
    realAnswer: realItem?.text ?? "",
    correctCount: realItem?.voterNames.length ?? 0,
    bluffVotes,
    bluffPoints,
    votePoints,
    totalPoints: votePoints + bluffPoints,
  };
}

export interface RankedPlayer {
  rank: number; // ties share a rank (1, 1, 3, ...)
  id: string;
  name: string;
  score: number;
}

/** Rank players by score descending; ties share the same rank. */
export function rankPlayers(
  players: Pick<Player, "id" | "name" | "score">[]
): RankedPlayer[] {
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name)
  );
  const ranked: RankedPlayer[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rank =
      i > 0 && sorted[i].score === sorted[i - 1].score
        ? ranked[i - 1].rank
        : i + 1;
    ranked.push({ rank, ...sorted[i] });
  }
  return ranked;
}

/** Winners = everyone sharing rank 1 (handles ties). */
export function getWinners(ranked: RankedPlayer[]): RankedPlayer[] {
  return ranked.filter((p) => p.rank === 1);
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateRoomCode(
  length = 5,
  random: () => number = Math.random
): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function sanitizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function sanitizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, 20);
}
