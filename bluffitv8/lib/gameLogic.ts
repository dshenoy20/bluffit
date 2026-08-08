import {
  MAX_ANSWER_LENGTH,
  REAL_ANSWER_ID,
  type Player,
  type PlayerGameStats,
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
  // One agnostic message for BOTH collisions (matches the real answer, or
  // matches another player's bluff) — a distinct "too close to the real
  // answer" message would hand the player a giant hint.
  const norm = normalizeAnswer(cleaned);
  const collides =
    norm === normalizeAnswer(realAnswer) ||
    existingAnswers.some((a) => normalizeAnswer(a) === norm);
  if (collides) {
    return {
      ok: false,
      reason: "That answer is already in play. Try a different bluff!",
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

/* Scoring: two dead-simple incentives.
 *   GET IT RIGHT  -> up to 100 points, more if you pick the real answer EARLIER
 *                    (1st correct vote = 100, 2nd = 90, 3rd = 80, ... 8th = 30)
 *   BLUFF WELL    -> +10 for every player who falls for your fake answer
 * The real answer never generates bluff points for anyone.
 */
export const CORRECT_BASE = 100;
export const CORRECT_STEP = 10;
export const POINTS_PER_FOOL = 50;

/** Points for the n-th (0-based) player to pick the real answer. */
export function correctPointsForRank(index: number): number {
  return Math.max(CORRECT_BASE - CORRECT_STEP * index, CORRECT_STEP);
}

export interface RoundScoring {
  /** playerId -> total points earned this round (correct + bluff) */
  pointsByPlayer: Record<string, number>;
  /** playerId -> points earned for picking the real answer (order-ranked) */
  correctAwards: Record<string, number>;
  revealOrder: RevealItem[];
}

/**
 * Score a round and build the reveal order.
 * Correct votes are ranked by the time they were cast (earlier = more points).
 * Bluff authors earn POINTS_PER_FOOL per player their fake answer fooled.
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
  const correctAwards: Record<string, number> = {};
  const add = (playerId: string, pts: number) => {
    pointsByPlayer[playerId] = (pointsByPlayer[playerId] ?? 0) + pts;
  };

  const votesFor = (optionId: string) =>
    votes.filter((v) => v.optionId === optionId);

  // Rank correct votes by when they were cast (missing timestamps sort last;
  // playerId tie-break keeps every client's computation deterministic).
  const correctVotes = votesFor(REAL_ANSWER_ID).sort(
    (a, b) =>
      (a.atMs ?? Number.MAX_SAFE_INTEGER) - (b.atMs ?? Number.MAX_SAFE_INTEGER) ||
      a.playerId.localeCompare(b.playerId)
  );
  correctVotes.forEach((v, i) => {
    const pts = correctPointsForRank(i);
    correctAwards[v.playerId] = pts;
    add(v.playerId, pts);
  });

  const items: RevealItem[] = options.map((opt) => {
    const optVotes =
      opt.id === REAL_ANSWER_ID ? correctVotes : votesFor(opt.id);
    const voterNames = optVotes.map((v) => nameOf(v.playerId));
    if (opt.id === REAL_ANSWER_ID) {
      return {
        optionId: opt.id,
        text: opt.text,
        authorName: "The real answer",
        voterNames, // ordered fastest-first
        pointsEarned: 0, // the real answer never earns bluff points
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
  return { pointsByPlayer, correctAwards, revealOrder: [...fakes, ...real] };
}

/* ---------- personal round result (shown between voting and the leaderboard) ---------- */

export interface PersonalResult {
  kind: "correct" | "fooled" | "no_vote";
  /** Name of the bluff's author, when kind === "fooled". */
  fooledBy: string | null;
  realAnswer: string;
  /** How many players picked the real answer this round. */
  correctCount: number;
  /** My speed rank among correct pickers (1 = fastest), when correct. */
  correctRank: number | null;
  /** Votes my own bluff received. */
  bluffVotes: number;
  bluffPoints: number;
  votePoints: number;
  totalPoints: number;
}

/** Fallback when a round predates stored awards: derive rank from the vote timestamps. */
function deriveCorrectAward(votes: Vote[], uid: string): number {
  const ranked = votes
    .filter((v) => v.optionId === REAL_ANSWER_ID)
    .sort(
      (a, b) =>
        (a.atMs ?? Number.MAX_SAFE_INTEGER) - (b.atMs ?? Number.MAX_SAFE_INTEGER) ||
        a.playerId.localeCompare(b.playerId)
    );
  const idx = ranked.findIndex((v) => v.playerId === uid);
  return idx === -1 ? 0 : correctPointsForRank(idx);
}

/** Derive one player's result for the round from the scored reveal data. */
export function buildPersonalResult(
  revealOrder: RevealItem[],
  votes: Vote[],
  uid: string,
  correctAwards: Record<string, number> | undefined
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
  // Prefer the awards computed at scoring time; if absent (round scored by an
  // older build), recompute the rank from vote order — never assume 1st place.
  const votePoints = correct
    ? (correctAwards?.[uid] ?? deriveCorrectAward(votes, uid))
    : 0;
  const correctRank =
    correct && votePoints > 0
      ? Math.round((CORRECT_BASE - votePoints) / CORRECT_STEP) + 1
      : null;

  return {
    kind: !myVote ? "no_vote" : correct ? "correct" : "fooled",
    fooledBy: myVote && !correct ? (votedItem?.authorName ?? "another player") : null,
    realAnswer: realItem?.text ?? "",
    correctCount: realItem?.voterNames.length ?? 0,
    correctRank,
    bluffVotes,
    bluffPoints,
    votePoints,
    totalPoints: votePoints + bluffPoints,
  };
}

/* ---------- per-game stats for the final awards ---------- */

/**
 * Fold one round's votes into the running per-game tallies.
 * A vote for the real answer -> voter's `correct`++. A vote for a fake ->
 * voter's `fooled`++ AND the bluff author's `fools`++ (a fake option's id IS
 * its author's playerId).
 */
export function tallyRoundStats(
  votes: Vote[],
  prev: Record<string, PlayerGameStats> | undefined
): Record<string, PlayerGameStats> {
  const out: Record<string, PlayerGameStats> = {};
  for (const [uid, s] of Object.entries(prev ?? {})) out[uid] = { ...s };
  const bump = (uid: string, key: keyof PlayerGameStats, n = 1) => {
    out[uid] = out[uid] ?? { correct: 0, fooled: 0, fools: 0 };
    out[uid][key] += n;
  };
  for (const v of votes) {
    if (v.optionId === REAL_ANSWER_ID) {
      bump(v.playerId, "correct");
    } else {
      bump(v.playerId, "fooled");
      bump(v.optionId, "fools");
    }
  }
  return out;
}

/** Players tied for the highest value of `key` (empty when the max is 0). */
export function topPlayersBy(
  stats: Record<string, PlayerGameStats> | undefined,
  key: keyof PlayerGameStats
): { ids: string[]; value: number } {
  let max = 0;
  for (const s of Object.values(stats ?? {})) max = Math.max(max, s[key]);
  if (max === 0) return { ids: [], value: 0 };
  const ids = Object.entries(stats ?? {})
    .filter(([, s]) => s[key] === max)
    .map(([id]) => id)
    .sort();
  return { ids, value: max };
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
