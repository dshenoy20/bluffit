import type { Timestamp } from "firebase/firestore";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const DEFAULT_ROUNDS = 5;
export const ROUND_OPTIONS = [5, 10, 15, 20] as const;
export const ANSWER_SECONDS = 60;
export const VOTING_SECONDS = 30;
/** How long each player's personal result stays on screen before the leaderboard. */
export const REVEAL_SECONDS = 6;
export const MAX_ANSWER_LENGTH = 80;
export const MAX_NAME_LENGTH = 20;
/** A room expires after this much time without meaningful activity (any game-state write). */
export const ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const HEARTBEAT_MS = 20_000;
export const PRESENCE_TIMEOUT_MS = 60_000;
export const PHASE_GRACE_MS = 3_000;

/** Special author id for the real answer among voting options. */
export const REAL_ANSWER_ID = "REAL";

export type RoomPhase =
  | "LOBBY"
  | "ANSWER" // question shown + players submit (PRD phases 1+2)
  | "VOTING"
  | "REVEAL"
  | "SCOREBOARD"
  | "FINAL";

export interface VotingOption {
  /** Author playerId, or REAL_ANSWER_ID for the real answer. */
  id: string;
  text: string;
}

export interface RevealItem {
  optionId: string;
  text: string;
  authorName: string; // "The real answer" for REAL
  voterNames: string[];
  pointsEarned: number; // points this answer earned its author this round
  isReal: boolean;
}

export interface Room {
  roomCode: string;
  hostId: string;
  phase: RoomPhase;
  /** 1-based round number. */
  currentRound: number;
  /** Increments on Play Again; namespaces submission/vote doc ids. */
  gameCount: number;
  /** Epoch millis when the current timed phase ends; null for host-controlled phases. */
  phaseEndsAt: number | null;
  votingOptions: VotingOption[];
  revealOrder: RevealItem[];
  revealIndex: number;
  /** Guard against double scoring: `${gameCount}_${round}` of the last scored round. */
  scoredKey: string;
  /** Question ids randomly picked for this game (fresh set each Play Again). Numeric ids = legacy pool. */
  questionIds?: QuestionId[];
  /** Rounds per game chosen by the host at room creation. Legacy rooms: 5. */
  totalRounds?: number;
  /** Question theme chosen by the host at room creation. Legacy rooms: random. */
  theme?: string;
  /** Epoch millis when the current game started; used for duration analytics. */
  gameStartedAt?: number;
  /** playerId -> points awarded for picking the real answer this round (order-ranked). */
  correctAwards?: Record<string, number>;
  /** playerId -> TOTAL points earned in the round just scored (drives leaderboard deltas). */
  roundPoints?: Record<string, number>;
  /** playerId -> avatar key. Kept on the room doc so selection is race-safe in one transaction. */
  avatars?: Record<string, string>;
  createdAt: Timestamp;
  lastActivity: Timestamp;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  joinedAt: Timestamp;
  /** Epoch millis of last heartbeat. */
  lastSeen: number;
}

export interface Submission {
  playerId: string;
  answer: string; // trimmed display text; "" = blank submission
  round: number;
}

export interface Vote {
  playerId: string;
  optionId: string; // author playerId or REAL_ANSWER_ID
  round: number;
  /** When the vote was cast (epoch millis, from the server timestamp). Ranks correct votes. */
  atMs?: number;
}

/** String ids ("h12", "g40") index the themed pools; numeric ids are the legacy pool. */
export type QuestionId = string | number;

export interface Question {
  id: QuestionId;
  question: string;
  answer: string;
}

/** Rounds in a game, with the pre-config default for legacy rooms. */
export function getTotalRounds(room: { totalRounds?: number }): number {
  return room.totalRounds ?? DEFAULT_ROUNDS;
}
